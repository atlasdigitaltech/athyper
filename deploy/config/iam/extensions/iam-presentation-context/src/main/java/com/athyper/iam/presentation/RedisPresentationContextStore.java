package com.athyper.iam.presentation;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.net.ssl.SSLSocketFactory;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

final class RedisPresentationContextStore {
    private static final int MAX_RESPONSE_BYTES = 16 * 1024;
    private static final String KEY_PREFIX = "iam:presentation:v1:";

    private final RedisEndpoint endpoint;
    private final ObjectMapper objectMapper;

    RedisPresentationContextStore(String redisUrl) {
        this.endpoint = RedisEndpoint.parse(redisUrl);
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    IamPresentationContext consume(String state) throws IOException {
        if (state == null || !state.matches("^[A-Za-z0-9_-]{32,256}$")) return null;
        try (Socket socket = endpoint.openSocket()) {
            var input = new BufferedInputStream(socket.getInputStream());
            var output = new BufferedOutputStream(socket.getOutputStream());
            if (endpoint.password() != null) {
                if (endpoint.username() == null || endpoint.username().isBlank()) {
                    command(output, "AUTH", endpoint.password());
                } else {
                    command(output, "AUTH", endpoint.username(), endpoint.password());
                }
                requireOkay(input);
            }
            if (endpoint.database() != 0) {
                command(output, "SELECT", Integer.toString(endpoint.database()));
                requireOkay(input);
            }
            command(output, "GETDEL", KEY_PREFIX + state);
            String json = readBulkString(input);
            return json == null ? null : objectMapper.readValue(json, IamPresentationContext.class);
        }
    }

    private static void command(BufferedOutputStream output, String... parts) throws IOException {
        output.write(("*" + parts.length + "\r\n").getBytes(StandardCharsets.US_ASCII));
        for (String part : parts) {
            byte[] bytes = part.getBytes(StandardCharsets.UTF_8);
            output.write(("$" + bytes.length + "\r\n").getBytes(StandardCharsets.US_ASCII));
            output.write(bytes);
            output.write("\r\n".getBytes(StandardCharsets.US_ASCII));
        }
        output.flush();
    }

    private static void requireOkay(BufferedInputStream input) throws IOException {
        int type = input.read();
        String line = readLine(input);
        if (type != '+' || !"OK".equals(line)) {
            throw new IOException("Redis command was rejected");
        }
    }

    private static String readBulkString(BufferedInputStream input) throws IOException {
        int type = input.read();
        if (type == -1) throw new EOFException("Redis closed the connection");
        if (type == '-') throw new IOException("Redis command failed");
        if (type != '$') throw new IOException("Unexpected Redis response type");
        int length;
        try {
            length = Integer.parseInt(readLine(input));
        } catch (NumberFormatException error) {
            throw new IOException("Invalid Redis bulk response", error);
        }
        if (length == -1) return null;
        if (length < 0 || length > MAX_RESPONSE_BYTES) throw new IOException("Redis response exceeds limit");
        byte[] bytes = input.readNBytes(length);
        if (bytes.length != length || input.read() != '\r' || input.read() != '\n') {
            throw new EOFException("Incomplete Redis bulk response");
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static String readLine(BufferedInputStream input) throws IOException {
        var builder = new StringBuilder();
        while (builder.length() <= 1024) {
            int current = input.read();
            if (current == -1) throw new EOFException("Redis closed the connection");
            if (current == '\r') {
                if (input.read() != '\n') throw new IOException("Malformed Redis response");
                return builder.toString();
            }
            builder.append((char) current);
        }
        throw new IOException("Redis response line exceeds limit");
    }

    record RedisEndpoint(
            String scheme,
            String host,
            int port,
            String username,
            String password,
            int database,
            int connectTimeoutMs,
            int readTimeoutMs) {

        static RedisEndpoint parse(String value) {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("IAM_PRESENTATION_REDIS_URL is required");
            }
            URI uri = URI.create(value.trim());
            String scheme = uri.getScheme();
            if (!"redis".equals(scheme) && !"rediss".equals(scheme)) {
                throw new IllegalArgumentException("IAM presentation context requires redis:// or rediss://");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new IllegalArgumentException("IAM presentation Redis host is required");
            }
            String username = null;
            String password = null;
            if (uri.getRawUserInfo() != null) {
                String[] credentials = uri.getRawUserInfo().split(":", 2);
                if (credentials.length == 1) {
                    password = decode(credentials[0]);
                } else {
                    username = decode(credentials[0]);
                    password = decode(credentials[1]);
                }
            }
            int database = 0;
            if (uri.getPath() != null && uri.getPath().length() > 1) {
                database = Integer.parseInt(uri.getPath().substring(1));
                if (database < 0 || database > 63) throw new IllegalArgumentException("Invalid Redis database");
            }
            return new RedisEndpoint(
                    scheme,
                    uri.getHost(),
                    uri.getPort() > 0 ? uri.getPort() : 6379,
                    username,
                    password,
                    database,
                    integerEnvironment("IAM_PRESENTATION_REDIS_CONNECT_TIMEOUT_MS", 1000, 100, 5000),
                    integerEnvironment("IAM_PRESENTATION_REDIS_READ_TIMEOUT_MS", 1000, 100, 5000));
        }

        Socket openSocket() throws IOException {
            Socket socket = "rediss".equals(scheme)
                    ? SSLSocketFactory.getDefault().createSocket()
                    : new Socket();
            socket.connect(new InetSocketAddress(host, port), connectTimeoutMs);
            socket.setSoTimeout(readTimeoutMs);
            return socket;
        }

        private static String decode(String value) {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        }

        private static int integerEnvironment(String name, int fallback, int minimum, int maximum) {
            try {
                int value = Integer.parseInt(System.getenv().getOrDefault(name, Integer.toString(fallback)));
                return Math.max(minimum, Math.min(maximum, value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
    }
}
