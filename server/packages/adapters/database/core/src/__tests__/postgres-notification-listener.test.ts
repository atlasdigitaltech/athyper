import {describe,expect,it} from "vitest";
import {createPostgresNotificationListener} from "../index.js";
describe("PostgreSQL invalidation listener",()=>{
 it("requires an explicit direct session and safe channel",()=>{expect(()=>createPostgresNotificationListener({connectionString:"postgres://localhost/db",channel:"bad-channel",connectionMode:"direct"})).toThrow("channel");expect(()=>createPostgresNotificationListener({connectionString:"postgres://localhost/db",channel:"athyper_invalidation",connectionMode:"transaction" as "direct"})).toThrow("direct PostgreSQL");});
});
