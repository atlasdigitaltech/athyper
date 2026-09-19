#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
dependency_root="${repository_root}/node_modules/.cache/playwright-linux-libs"

if [[ "$(uname -s)" == "Linux" ]]; then
  library_dir="${dependency_root}/usr/lib/x86_64-linux-gnu"
  if [[ ! -f "${library_dir}/libnspr4.so" || ! -f "${library_dir}/libnss3.so" || ! -f "${library_dir}/libasound.so.2" ]]; then
    if ! command -v apt-get >/dev/null || ! command -v dpkg-deb >/dev/null; then
      echo "Playwright Linux dependencies are missing and apt-get/dpkg-deb are unavailable." >&2
      echo "Run 'pnpm exec playwright install-deps chromium' as an administrator." >&2
      exit 2
    fi
    mkdir -p "${dependency_root}"
    download_dir="$(mktemp -d)"
    trap 'rm -rf -- "${download_dir}"' EXIT
    (
      cd "${download_dir}"
      apt-get download libnspr4 libnss3 libasound2t64
      for package_file in ./*.deb; do
        dpkg-deb -x "${package_file}" "${dependency_root}"
      done
    )
  fi
  export LD_LIBRARY_PATH="${library_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
fi

cd "${repository_root}"
exec pnpm exec playwright "$@"
