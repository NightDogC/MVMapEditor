/* Typed access to the classic scripts shared with the UE whitebox importer (mvmap-types.js, mvmap-ue.js at the repo
   root). index.html loads them before the app bundle; edit them there, not here. */
import type { MapDoc, ElementLayer } from "./model/types.ts";

export interface Region {
  label: string;
  region: string;
  letter: string;
}
export interface ElementType {
  id: string;
  label: string;
  layer: ElementLayer;
  generate: "auto" | "manual";
  color: string;
  emoji: string;
  oldIds?: string[];
  oldLabels?: string[];
}
interface Typed {
  typeId?: string | null;
  name: string;
}
export interface UEApi {
  roomCode(letter: string | null | undefined, number: number | null | undefined): string;
  parseRoomNumber(text: string): { value: number | null; error: string | null };
  findUeFieldErrors(doc: MapDoc, regions: Region[]): string[];
  buildExportDoc(doc: MapDoc, regions: Region[], types: ElementType[]): MapDoc;
  findRegion(regions: Region[], name: string | null | undefined): Region | null;
  typesForLayer(types: ElementType[], layer: ElementLayer): ElementType[];
  elementTypeOf(el: Typed, layer: ElementLayer, types: ElementType[]): ElementType | null;
  migrateTypeIds<T extends MapDoc>(doc: T, types: ElementType[]): T;
  defaultElementName(layer: ElementLayer, n: number): string;
  chooseType<T extends Typed>(el: T, layer: ElementLayer, typeId: string, types: ElementType[]): T;
  manualMarkOf(el: Typed, layer: ElementLayer, types: ElementType[]): "manual" | "unclassified" | null;
}

declare global {
  interface Window {
    MVMapTypes?: { regions: Region[]; types: ElementType[] };
    MVMapUE?: UEApi;
  }
}

const missing = typeof window !== "undefined" && (!window.MVMapTypes || !window.MVMapUE);
if (missing) alert("mvmap-types.js / mvmap-ue.js not found — keep them in the same folder as index.html.");

export const UE = (typeof window !== "undefined" && window.MVMapUE) as UEApi;
export const REGIONS: Region[] = (typeof window !== "undefined" && window.MVMapTypes?.regions) || [];
export const ELEMENT_TYPES: ElementType[] = (typeof window !== "undefined" && window.MVMapTypes?.types) || [];
