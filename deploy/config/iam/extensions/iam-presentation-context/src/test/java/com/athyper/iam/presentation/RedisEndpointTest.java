package com.athyper.iam.presentation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RedisEndpointTest {
    @Test
    void parsesAclCredentialsAndDatabase() {
        var endpoint = RedisPresentationContextStore.RedisEndpoint.parse(
                "redis://app:p%40ss@memorycache:6380/3");

        assertEquals("memorycache", endpoint.host());
        assertEquals(6380, endpoint.port());
        assertEquals("app", endpoint.username());
        assertEquals("p@ss", endpoint.password());
        assertEquals(3, endpoint.database());
    }

    @Test
    void rejectsNonRedisSchemes() {
        assertThrows(IllegalArgumentException.class,
                () -> RedisPresentationContextStore.RedisEndpoint.parse("https://memorycache:6379/0"));
    }
}
