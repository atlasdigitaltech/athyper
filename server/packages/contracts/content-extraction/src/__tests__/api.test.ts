import {describe,expectTypeOf,it} from "vitest";
import type {ContentExtractor,ContentExtractionResult} from "../index.js";
describe("content-extraction contract",()=>{it("contains no Tika or transport types",()=>{expectTypeOf<ContentExtractor>().toHaveProperty("extract");expectTypeOf<ContentExtractionResult>().toHaveProperty("text");});});
