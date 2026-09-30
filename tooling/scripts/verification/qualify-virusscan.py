#!/usr/bin/env python3
"""Local ClamAV qualification. Real daemon; isolated, unsigned fixture DB for failure tests.

Requires Docker, Python 3 and the workspace's pnpm/tsx installation. Does not update the
live database, change host firewall rules, or modify application containers. Apply the
Compose scanner policy before running. The live RELOAD command reloads the existing DB.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import pathlib
import os
import socket
import struct
import subprocess
import tarfile
import tempfile
import time
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]


def command(*args, input=None, timeout=60):
    return subprocess.run(args, input=input, text=True, capture_output=True,
                          check=True, timeout=timeout).stdout.strip()


def inspect(name):
    return json.loads(command("docker", "inspect", name))[0]


def request(host, text=None, content=None, port=3310):
    with socket.create_connection((host, port), timeout=3) as conn:
        conn.settimeout(45)
        if content is None:
            conn.sendall(("n" + text + "\n").encode())
        else:
            conn.sendall(b"nINSTREAM\n")
            try:
                for offset in range(0, len(content), 65536):
                    chunk = content[offset:offset + 65536]
                    conn.sendall(struct.pack("!I", len(chunk)) + chunk)
                conn.sendall(bytes(4))
            except (BrokenPipeError, ConnectionResetError):
                pass  # clamd may reject before reading the whole submitted stream.
        result = b""
        while b"\n" not in result and b"\0" not in result:
            chunk = conn.recv(4096)
            if not chunk:
                break
            result += chunk
        return result.decode().strip("\n\0 ")


def wait_version(host, revision=None):
    until = time.monotonic() + 45
    while time.monotonic() < until:
        try:
            version = request(host, "VERSION")
            if revision is None or f"/{revision}/" in version:
                return version
        except (OSError, TimeoutError):
            pass
        time.sleep(.25)
    raise RuntimeError(f"Daemon did not load revision {revision}")


def fixture_db(directory, revision, age_days):
    # CUD is ClamAV's supported unsigned archive format. Never install this in live storage.
    built = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=age_days)
    header = f"ClamAV-VDB:{built:%d %b %Y %H-%M %z}:{revision}:1:90:X:X:qualification:{int(built.timestamp())}"
    signature = b"Qualification.Marker:0:*:5155414c494649434154494f4e5f4d41524b45525f554e49515545\n"
    info = (header + f"\ndaily.ndb:{len(signature)}:{hashlib.sha256(signature).hexdigest()}\n").encode()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for name, data in [("daily.info", info), ("daily.ndb", signature)]:
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            tar.addfile(entry, io.BytesIO(data))
    pending = directory / "next-db"
    pending.write_bytes(header.encode().ljust(512, b" ") + archive.getvalue())
    pending.replace(directory / "daily.cud")


def adapter_probe(host, directory):
    source = ROOT / "server/packages/adapters/malware-clamav/src/clamav-malware-scanner.ts"
    script = directory / "probe.mts"
    script.write_text(f"""import {{createClamAvMalwareScanner}} from {json.dumps(str(source))};
const scanner=createClamAvMalwareScanner({{host:{json.dumps(host)},port:3310,timeoutMs:5000}});
try {{
 const health=await scanner.health();
 let scan;try{{scan=await scanner.scan({{content:new TextEncoder().encode('benign qualification')}})}}
 catch(e){{scan={{code:(e as any).code}}}}
 console.log(JSON.stringify({{health,scan}}));
}} finally {{scanner.close()}}
""")
    return json.loads(command("pnpm", "--filter", "@athyper/server-platform-host", "exec", "tsx", str(script)))


def zipped(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files:
            archive.writestr(name, data)
    return output.getvalue()


def limits(host, file_bytes, scan_bytes, recursion):
    member_size = min(file_bytes - 1, scan_bytes // 5)
    nested = b"benign qualification"
    for i in range(recursion + 3):
        nested = zipped([(f"level-{i}.zip", nested)])
    # Top-level stream transfer stays small for the production-size archive tests.
    results = {
        "MaxFileSize": request(host, content=zipped([("large.txt", b"x" * (file_bytes + 1))])),
        "MaxScanSize": request(host, content=zipped([(f"part-{i}.txt", b"y" * member_size) for i in range(6)])),
        "MaxRecursion": request(host, content=nested),
    }
    return {key: {"response": response, "passed": f"Heuristics.Limits.Exceeded.{key} FOUND" in response}
            for key, response in results.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="athyper-dev-virusscan-1")
    parser.add_argument("--clients", nargs="*", default=["athyper-dev-api-1", "athyper-dev-worker-1"])
    parser.add_argument("--host-pids", nargs="*", type=int, default=[])
    parser.add_argument("--allow-loopback-publication", action="store_true")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    report = {"startedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "scope": "local-dev; not production certification"}
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        live = inspect(args.container)
        image = live["Image"]
        networks = live["NetworkSettings"]["Networks"]
        assert len(networks) == 2, "Scanner must use only document-services and signature-egress"
        document_network = next(n for n in networks if n.endswith("_document-services"))
        assert any(n.endswith("_signature-egress") for n in networks), "Missing signature egress network"
        assert json.loads(command("docker", "network", "inspect", document_network))[0]["Internal"], "Document network must be internal"
        host = networks[document_network]["IPAddress"]
        report["deployment"] = {"container": args.container, "imageId": image,
            "repoDigests": inspect(image)["RepoDigests"], "portBindings": live["HostConfig"]["PortBindings"],
            "networks": {n: {"ip": v["IPAddress"], "internal": json.loads(command("docker", "network", "inspect", n))[0]["Internal"]} for n,v in networks.items()}}
        bindings = live["HostConfig"]["PortBindings"] or {}
        assert not bindings or (args.allow_loopback_publication and all(
            binding["HostIp"] in ("127.0.0.1", "::1")
            for entries in bindings.values() for binding in entries)), "Unexpected published scanner port"
        report["before"] = {"version": request(host, "VERSION"), "config": command("docker", "exec", args.container, "clamconf", "-n")}
        report["freshclamHistory"] = command("docker", "exec", args.container, "tail", "-48", "/var/log/clamav/freshclam.log")
        report["freshclamProcess"] = command("docker", "exec", args.container, "sh", "-c", "ps | grep 'freshclam --checks' | grep -v grep")
        report["listeners"] = command("docker", "exec", args.container, "sh", "-c", "netstat -lnt; ls -l /tmp/clamd.sock; date -u")
        runtime_js = """const fs=require('fs');(async()=>{for(const p of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){let c;try{c=fs.readFileSync(`/proc/${p}/cmdline`,'utf8')}catch{continue}if(!c.startsWith('node\\0')||c.includes('node -e')||c.includes('const fs='))continue;for(const e of fs.readFileSync(`/proc/${p}/environ`,'utf8').split('\\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1)}const {loadConfig}=await import(fs.existsSync('./dist/config/index.js')?'./dist/config/index.js':'./server/apps/platform-host/src/config/index.ts');const cfg=loadConfig();console.log(JSON.stringify({pid:p,malwareScanning:cfg.malwareScanning,maxUploadMb:cfg.objectStorage.maxUploadMb}));break;}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
        ping_js = "const s=require('net').createConnection({host:'virusscan',port:3310},()=>s.write('nPING\\n'));s.setTimeout(3000,()=>{s.destroy();process.exitCode=1});s.on('data',d=>{console.log(d.toString().trim());s.destroy()});s.on('error',()=>{process.exitCode=1})"
        report["clients"] = {}
        for client in args.clients:
            runtime = json.loads(command("docker", "exec", client, "node", "--import", "tsx", "-e", runtime_js))
            runtime["ping"] = command("docker", "exec", client, "node", "-e", ping_js)
            assert runtime["ping"] == "PONG"
            assert runtime["malwareScanning"]["maxBytes"] <= 104857600
            report["clients"][client] = runtime
        for pid in args.host_pids:
            env = dict(item.split("=", 1) for item in pathlib.Path(f"/proc/{pid}/environ").read_text().split("\0") if "=" in item)
            with tempfile.TemporaryDirectory(prefix="athyper-clamav-runtime-") as tmp:
                script = pathlib.Path(tmp) / "runtime.mts"
                source = ROOT / "server/apps/platform-host/src/config/index.ts"
                script.write_text(f"import {{loadConfig}} from {json.dumps(str(source))}; const c=loadConfig(); console.log(JSON.stringify({{malwareScanning:c.malwareScanning,maxUploadMb:c.objectStorage.maxUploadMb}}));")
                runtime = json.loads(subprocess.run(["pnpm", "--filter", "@athyper/server-platform-host", "exec", "tsx", str(script)], env={**os.environ, **env}, cwd=ROOT, check=True, text=True, capture_output=True, timeout=60).stdout)
            settings = runtime["malwareScanning"]
            runtime["ping"] = request(settings["host"], "PING", port=settings["port"])
            assert runtime["ping"] == "PONG"
            assert settings["maxBytes"] <= 104857600
            report["clients"][f"host-pid-{pid}"] = runtime
        assert report["clients"], "Supply running Docker clients or --host-pids for runtime alignment evidence"
        # Host is trusted and may route to bridge IPs without any published port.
        report["hostDirectPing"] = request(host, "PING")
        report["networkProbes"] = {}
        project = document_network.removesuffix("_document-services")
        available = command("docker", "network", "ls", "--format", "{{.Name}}").splitlines()
        for network in [document_network] + [f"{project}_{n}" for n in ("data", "app", "edge", "ops") if f"{project}_{n}" in available]:
            probe = command("docker", "run", "--rm", "--network", network, "--entrypoint", "sh", image,
                "-c", 'printf "nPING\\n" | nc -w 2 "$1" 3310 || true', "probe", host, timeout=15)
            report["networkProbes"][network] = probe or "no response"
            assert (probe == "PONG") == (network == document_network), report["networkProbes"]
            if network != document_network:
                for target, endpoint in networks.items():
                    if target == document_network:
                        continue
                    response = command("docker", "run", "--rm", "--network", network, "--entrypoint", "sh", image,
                        "-c", 'printf "nPING\\n" | nc -w 2 "$1" 3310 || true', "probe", endpoint["IPAddress"], timeout=15)
                    report["networkProbes"][f"{network} -> {target}"] = response or "no response"
                    assert response != "PONG", report["networkProbes"]
        # A peer on the egress network CAN reach its interface. This is explicitly documented.
        for network, endpoint in networks.items():
            if network != document_network:
                probe = command("docker", "run", "--rm", "--network", network, "--entrypoint", "sh", image,
                    "-c", 'printf "nPING\\n" | nc -w 2 "$1" 3310', "probe", endpoint["IPAddress"])
                report["networkProbes"][network] = probe
                assert probe == "PONG"

        with tempfile.TemporaryDirectory(prefix="athyper-clamav-qualification-") as tmp:
            directory = pathlib.Path(tmp)
            database = directory / "db"
            database.mkdir()
            fixture_db(database, 900001, 3)
            cfg = "Foreground yes\nDatabaseDirectory /qualification/db\nLocalSocket /tmp/qualification.sock\nTCPSocket 3310\nUser root\nSelfCheck 1\nConcurrentDatabaseReload no\nAlertExceedsMax yes\nStreamMaxLength 100M\nMaxFileSize 1M\nMaxScanSize 4M\nMaxRecursion 3\n"
            (directory / "clamd.conf").write_text(cfg)
            name = "athyper-clamav-qualification-" + uuid.uuid4().hex[:10]
            command("docker", "run", "-d", "--name", name, "--network", "bridge", "--entrypoint", "clamd",
                "-v", f"{tmp}:/qualification:ro", image, "--config-file=/qualification/clamd.conf")
            try:
                ip = inspect(name)["NetworkSettings"]["Networks"]["bridge"]["IPAddress"]
                recovery = {"fixture": "unsigned CUD, real clamd 1.5.2, never mounted in live scanner", "beforeVersion": wait_version(ip, 900001)}
                recovery["staleAdmission"] = adapter_probe(ip, directory)
                assert recovery["staleAdmission"]["scan"]["code"] == "MALWARE_SCANNER_SIGNATURE_STALE"
                fixture_db(database, 900002, 0)
                recovery["reloadReply"] = request(ip, "RELOAD")
                recovery["afterVersion"] = wait_version(ip, 900002)
                recovery["freshAdmission"] = adapter_probe(ip, directory)
                assert recovery["freshAdmission"]["health"]["status"] == "healthy"
                assert recovery["freshAdmission"]["scan"]["status"] == "clean"
                # Missed notification: no RELOAD command; SelfCheck must recover it.
                fixture_db(database, 900003, 0)
                recovery["selfCheckVersion"] = wait_version(ip, 900003)
                report["isolatedRecovery"] = recovery
                report["isolatedInspectionLimits"] = limits(ip, 1048576, 4194304, 3)
                marker = b"QUALIFICATION_MARKER_UNIQUE"
                report["isolatedTruncation"] = {
                    "markerAtStart": request(ip, content=zipped([("marker.txt", marker)])),
                    "markerBeyondLimit": request(ip, content=zipped([("marker.txt", b"x" * 1048576 + marker)])),
                    "note": "Harmless custom signature, placed before/after the 1 MiB extraction limit.",
                }
                boundary = {}
                report["isolatedZipBoundaries"] = boundary
                for compression, label in [(zipfile.ZIP_STORED, "stored"), (zipfile.ZIP_DEFLATED, "deflate"), (zipfile.ZIP_BZIP2, "bzip2")]:
                    for size in [1048000, 1048576, 1048577]:
                        archive = io.BytesIO()
                        with zipfile.ZipFile(archive, "w", compression) as file:
                            file.writestr("member.txt", b"x" * size)
                        response = request(ip, content=archive.getvalue())
                        # MaxFileSize also applies to the outer archive. A stored
                        # ZIP with a limit-sized member exceeds it due to headers.
                        expected = "FOUND" if max(size, len(archive.getvalue())) > 1048576 else "OK"
                        boundary[f"{label}-{size}"] = response
                        assert response.endswith(expected), boundary
                report["isolatedZipBoundaries"] = boundary
                assert "Qualification.Marker" in report["isolatedTruncation"]["markerAtStart"]
                assert "Heuristics.Limits.Exceeded.MaxFileSize FOUND" in report["isolatedTruncation"]["markerBeyondLimit"]
                report["isolatedDaemonLog"] = command("docker", "logs", name)
            finally:
                command("docker", "rm", "-f", name)

        report["effectiveConfig"] = command("docker", "exec", args.container, "clamconf", "-n")
        report["liveInspectionLimits"] = limits(host, 104857600, 419430400, 17)
        before_reload = request(host, "VERSION")
        report["liveReload"] = {"before": before_reload, "reply": request(host, "RELOAD")}
        until = time.monotonic() + 45
        while time.monotonic() < until:
            logs = command("docker", "logs", "--since", report["startedAt"], args.container)
            if "Database correctly reloaded" in logs:
                break
            time.sleep(.5)
        else:
            raise RuntimeError("No live daemon reload-completion log within 45 seconds")
        report["liveReload"]["completionLog"] = logs
        report["liveReload"]["after"] = wait_version(host)
        report["liveReload"]["note"] = "Same official revision on disk; no CDN update claimed. Revision-changing recovery tested in isolation."
        report["acceptanceFailures"] = [f"{scope}.{key}: {result['response']}"
            for scope in ("isolatedInspectionLimits", "liveInspectionLimits")
            for key, result in report[scope].items() if not result["passed"]]
        assert not report["acceptanceFailures"], report["acceptanceFailures"]
        report["passed"] = True
    except Exception as error:
        report["passed"] = False
        report["failure"] = str(error)
        raise
    finally:
        report["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Evidence: {output}", flush=True)


if __name__ == "__main__":
    main()
