/* Typed access to the classic scripts shared with the UE whitebox importer (mvmap-types.js, mvmap-ue.js at the repo
   root). index.html loads them before the app bundle; edit them there, not here. */
import type { MapDoc, ElementLayer, StampAnchor, Stamp } from "./model/types.ts";

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
  /** two-level type picker: category name and this type's name inside it */
  group?: string;
  subLabel?: string;
  /** stamps only: default anchor (SnapToGround when absent), and whether the type fixes it */
  anchor?: StampAnchor;
  anchorLocked?: boolean;
}
/** groupOldIds in mvmap-types.js: the old id of a split type -> the group its elements open with */
export interface GroupOldId {
  id: string;
  layer: ElementLayer;
  group: string;
}
/** first-level entry of the two-level type picker */
export type TypePickerEntry = { type: ElementType; group?: undefined } | { group: string; types: ElementType[]; type?: undefined };
export interface Typed {
  typeId?: string | null;
  typeGroup?: string | null;
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
  migrateTypeIds<T extends MapDoc>(doc: T, types: ElementType[], groupOldIds?: GroupOldId[]): T;
  defaultElementName(layer: ElementLayer, n: number): string;
  chooseType<T extends Typed>(el: T, layer: ElementLayer, typeId: string, types: ElementType[]): T;
  manualMarkOf(el: Typed, layer: ElementLayer, types: ElementType[]): "manual" | "unclassified" | null;
  typePickerEntries(types: ElementType[], layer: ElementLayer): TypePickerEntry[];
  typeGroupOf(el: Typed, layer: ElementLayer, types: ElementType[]): string | null;
  pendingTypeGroupOf(el: Typed, layer: ElementLayer, types: ElementType[]): string | null;
  chooseTypeGroup<T extends Typed>(el: T, layer: ElementLayer, group: string, types: ElementType[]): T;
  STAMP_ANCHORS: StampAnchor[];
  defaultStampAnchor(type: ElementType | null): StampAnchor;
  isStampAnchorLocked(st: Stamp, types: ElementType[]): boolean;
  stampAnchorOf(st: Stamp, types: ElementType[]): StampAnchor;
  migrateStampAnchors<T extends MapDoc>(doc: T, types: ElementType[]): T;
}

declare global {
  interface Window {
    MVMapTypes?: { regions: Region[]; types: ElementType[]; groupOldIds?: GroupOldId[] };
    MVMapUE?: UEApi;
  }
}

const missing = typeof window !== "undefined" && (!window.MVMapTypes || !window.MVMapUE);
if (missing) alert("mvmap-types.js / mvmap-ue.js not found — keep them in the same folder as index.html.");

export const UE = (typeof window !== "undefined" && window.MVMapUE) as UEApi;
export const REGIONS: Region[] = (typeof window !== "undefined" && window.MVMapTypes?.regions) || [];
export const ELEMENT_TYPES: ElementType[] = (typeof window !== "undefined" && window.MVMapTypes?.types) || [];
export const GROUP_OLD_IDS: GroupOldId[] = (typeof window !== "undefined" && window.MVMapTypes?.groupOldIds) || [];
