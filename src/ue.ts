/* Typed access to the classic scripts shared with the UE whitebox importer (mvmap-types.js, mvmap-ue.js at the repo
   root). index.html loads them before the app bundle; edit them there, not here. */
import type { MapDoc, ElementLayer, StampAnchor, Stamp, StampCategories, StampGroup, StampType, Tier, TierValue } from "./model/types.ts";

export interface Region {
  label: string;
  region: string;
  letter: string;
}
/** A structure / edge type from mvmap-types.js `types`. */
export interface FixedType {
  id: string;
  label: string;
  layer: Exclude<ElementLayer, "stamp">;
  generate: "auto" | "manual";
  color: string;
  emoji: string;
  oldIds?: string[];
  oldLabels?: string[];
}
/** What a Type dropdown offers: a fixed structure / edge type, or a stamp type from the document's categories. */
export type ElementType = FixedType | StampType;
/** oldStampIds in mvmap-types.js: an old stamp typeId -> the group / type / tier value its elements open with */
export interface OldStampId {
  id: string;
  label?: string;
  group?: string;
  type?: string;
  tier?: string;
}
/** mvmap-types.js */
export interface Vocabulary {
  regions: Region[];
  types: FixedType[];
  defaultStampCategories: StampCategories;
  oldStampIds: OldStampId[];
}
/** Element types of one document: the fixed structure / edge types plus its stamp categories (mvmap-ue.js vocabOf). */
export interface Vocab {
  types: FixedType[];
  stamp: StampCategories;
}
/** first-level entry of the Type dropdown */
export type TypePickerEntry = { type: ElementType; group?: undefined } | { group: StampGroup; types: StampType[]; type?: undefined };
export type ElementStatus = "complete" | "incomplete" | "unclassified";
export interface Typed {
  typeId?: string | null;
  typeGroup?: string | null;
  tier?: string | null;
  name: string;
}
/** What a tier hangs on: a group, or a type without a group. */
export type TierOwner = { group: string; type?: undefined } | { type: string; group?: undefined };
/** What countStampsUsing counts: stamps of a group / type, or with a value of a tier (any value, or one). */
export type StampUsageRef = TierOwner | (TierOwner & { tier: true }) | (TierOwner & { value: string });
/** Fields of a type the category panel edits. */
export type StampTypeFields = Partial<Pick<StampType, "label" | "emoji" | "color" | "anchor" | "anchorLocked">>;
export interface UEApi {
  newCategoryId(doc: MapDoc, prefix: string): string;
  addStampGroup<T extends MapDoc>(doc: T, id: string, label: string): T;
  addStampType<T extends MapDoc>(doc: T, id: string, fields: StampTypeFields & { group?: string }): T;
  updateStampGroup<T extends MapDoc>(doc: T, id: string, patch: { label?: string }): T;
  updateStampType<T extends MapDoc>(doc: T, id: string, patch: StampTypeFields): T;
  moveStampType<T extends MapDoc>(doc: T, id: string, groupId: string | null): T;
  removeStampType<T extends MapDoc>(doc: T, id: string): T;
  removeStampGroup<T extends MapDoc>(doc: T, id: string): T;
  setStampTier<T extends MapDoc>(doc: T, owner: TierOwner, label: string): T;
  removeStampTier<T extends MapDoc>(doc: T, owner: TierOwner): T;
  addTierValue<T extends MapDoc>(doc: T, owner: TierOwner, id: string, label: string): T;
  renameTierValue<T extends MapDoc>(doc: T, owner: TierOwner, id: string, label: string): T;
  removeTierValue<T extends MapDoc>(doc: T, owner: TierOwner, id: string): T;
  countStampsUsing(doc: MapDoc, ref: StampUsageRef): number;
  roomCode(letter: string | null | undefined, number: number | null | undefined): string;
  parseRoomNumber(text: string): { value: number | null; error: string | null };
  findUeFieldErrors(doc: MapDoc, regions: Region[]): string[];
  buildExportDoc(doc: MapDoc, regions: Region[], types: FixedType[]): MapDoc;
  findRegion(regions: Region[], name: string | null | undefined): Region | null;
  vocabOf(doc: MapDoc, types: FixedType[]): Vocab;
  fillStampCategories<T extends MapDoc>(doc: T, defaults: StampCategories): T;
  migrateTypeData<T extends MapDoc>(doc: T, vocabulary: Vocabulary): T;
  typesForLayer(vocab: Vocab, layer: ElementLayer): ElementType[];
  elementTypeOf(el: Typed, layer: ElementLayer, vocab: Vocab): ElementType | null;
  migrateTypeIds<T extends MapDoc>(doc: T, types: FixedType[], oldStampIds?: OldStampId[]): T;
  defaultElementName(layer: ElementLayer, n: number): string;
  chooseType<T extends Typed>(el: T, layer: ElementLayer, typeId: string, vocab: Vocab): T;
  manualMarkOf(el: Typed, layer: ElementLayer, vocab: Vocab): "manual" | "unclassified" | null;
  typePickerEntries(vocab: Vocab, layer: ElementLayer): TypePickerEntry[];
  groupMembers(vocab: Vocab, layer: ElementLayer, groupId: string): StampType[];
  typeGroupOf(el: Typed, layer: ElementLayer, vocab: Vocab): StampGroup | null;
  chooseTypeGroup<T extends Typed>(el: T, layer: ElementLayer, groupId: string, vocab: Vocab): T;
  tierOf(el: Typed, layer: ElementLayer, vocab: Vocab): Tier | null;
  tierValueOf(el: Typed, layer: ElementLayer, vocab: Vocab): TierValue | null;
  chooseTier<T extends Typed>(el: T, layer: ElementLayer, valueId: string, vocab: Vocab): T;
  elementStatusOf(el: Typed, layer: ElementLayer, vocab: Vocab): ElementStatus;
  statusLabelOf(el: Typed, layer: ElementLayer, vocab: Vocab): string;
  STAMP_ANCHORS: StampAnchor[];
  defaultStampAnchor(type: ElementType | null): StampAnchor;
  isStampAnchorLocked(st: Stamp, vocab: Vocab): boolean;
  stampAnchorOf(st: Stamp, vocab: Vocab): StampAnchor;
  migrateStampAnchors<T extends MapDoc>(doc: T, types: FixedType[]): T;
}

declare global {
  interface Window {
    MVMapTypes?: Vocabulary;
    MVMapUE?: UEApi;
  }
}

const missing = typeof window !== "undefined" && (!window.MVMapTypes || !window.MVMapUE);
if (missing) alert("mvmap-types.js / mvmap-ue.js not found — keep them in the same folder as index.html.");

export const UE = (typeof window !== "undefined" && window.MVMapUE) as UEApi;
export const VOCABULARY: Vocabulary = (typeof window !== "undefined" && window.MVMapTypes) || {
  regions: [],
  types: [],
  defaultStampCategories: { groups: [], types: [] },
  oldStampIds: [],
};
export const REGIONS: Region[] = VOCABULARY.regions;
export const ELEMENT_TYPES: FixedType[] = VOCABULARY.types;

/** The element types of `doc`: the fixed structure / edge types plus its stamp categories. */
export const vocabOf = (doc: MapDoc): Vocab => UE.vocabOf(doc, ELEMENT_TYPES);
