import {describe,expectTypeOf,it} from "vitest";
import type {DocumentSearchService,SearchIndex} from "../index.js";
describe("search contract",()=>{it("separates indexing from authorized query orchestration",()=>{expectTypeOf<SearchIndex>().toHaveProperty("upsert");expectTypeOf<DocumentSearchService>().toHaveProperty("search");});});
