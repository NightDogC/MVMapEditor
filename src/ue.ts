/* Typed access to the classic scripts shared with the UE whitebox importer (mvmap-types.js, mvmap-ue.js at the repo
   root). index.html loads them before the app bundle; edit them there, not here. */
import type { MapDoc, ElementLayer, ImportMethod, StampAnchor, Stamp, StampCategories, StampSubmenu, StampTier, StampType } from "./model/types.ts";

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
  importMethod: ImportMethod;
  color: string;
  emoji: string;
  oldIds?: string[];
  oldLabels?: string[];
  /** edge types only: a band edge type and its default thickness in cells (mvmap-ue.js isBandType) */
  band?: { thickness: number };
}
/** What a Type dropdown offers: a fixed structure / edge type, or a stamp type from the document's categories. */
export type ElementType = FixedType | StampType;
/** oldStampIds in mvmap-types.js: an old stamp typeId -> the type / tier its elements open with (no type: 未分类) */
export interface OldStampId {
  id: string;
  label?: string;
  type?: string;
  tier?: string;
}
/** mvmap-types.js: the fixed types, the default stamp categories, regions and old stamp ids (not one document's types:
    that is Vocab). */
export interface TypesFile {
  regions: Region[];
  types: FixedType[];
  defaultStampCategories: StampCategories;
  oldStampIds: OldStampId[];
}
/** Element types of one document: the fixed structure / edge types, its stamp categories, and the default stamp
    categories, which say how UE imports each stamp type (mvmap-ue.js vocabOf). */
export interface Vocab {
  types: FixedType[];
  stamp: StampCategories;
  defaults: StampCategories;
}
/** A section of the Type dropdown: the types outside any submenu (submenu null), or one submenu's types. */
export interface TypePickerSection {
  submenu: StampSubmenu | null;
  types: ElementType[];
}
/** A section of the category panel: the stamp types outside any submenu (submenu null), or one submenu's types. */
export interface StampCategorySection {
  submenu: StampSubmenu | null;
  types: StampType[];
}
export type ElementStatus = "complete" | "incomplete" | "unclassified";
export interface Typed {
  typeId?: string | null;
  tier?: string | null;
  name: string;
}
/** What countStampsUsing counts: stamps of a type, with any of its tiers, or with one of them. */
export type StampUsageRef = { type: string; tiers?: true; tier?: undefined } | { type: string; tier: string; tiers?: undefined };
/** A type, or one of its tiers: what an id rename names. */
export interface CategoryIdRef {
  type: string;
  tier?: string;
}
/** Why an id rename is refused (mvmap-ue.js categoryIdProblem). */
export type CategoryIdProblem = "missing" | "locked" | "format" | "taken";
/** Fields of a type the category panel edits. */
export type StampTypeFields = Partial<Pick<StampType, "label" | "emoji" | "color" | "anchor" | "anchorLocked">>;
export interface UEApi {
  usedCategoryIds(doc: MapDoc): Set<string>;
  isCategoryIdLocked(ref: CategoryIdRef, defaults: StampCategories): boolean;
  categoryIdProblem(doc: MapDoc, ref: CategoryIdRef, id: string, defaults: StampCategories): CategoryIdProblem | null;
  renameCategoryId<T extends MapDoc>(doc: T, ref: CategoryIdRef, id: string, defaults: StampCategories): T;
  addStampSubmenu<T extends MapDoc>(doc: T, id: string, label: string): T;
  updateStampSubmenu<T extends MapDoc>(doc: T, id: string, patch: { label?: string }): T;
  removeStampSubmenu<T extends MapDoc>(doc: T, id: string): T;
  addStampType<T extends MapDoc>(doc: T, id: string, fields: StampTypeFields & { submenu?: string }): T;
  updateStampType<T extends MapDoc>(doc: T, id: string, patch: StampTypeFields): T;
  moveStampType<T extends MapDoc>(doc: T, id: string, submenuId: string | null): T;
  removeStampType<T extends MapDoc>(doc: T, id: string): T;
  setStampTierLabel<T extends MapDoc>(doc: T, typeId: string, label: string): T;
  removeStampTiers<T extends MapDoc>(doc: T, typeId: string): T;
  addStampTier<T extends MapDoc>(doc: T, typeId: string, id: string, label: string): T;
  renameStampTier<T extends MapDoc>(doc: T, typeId: string, id: string, label: string): T;
  removeStampTier<T extends MapDoc>(doc: T, typeId: string, id: string): T;
  countStampsUsing(doc: MapDoc, ref: StampUsageRef): number;
  roomCode(letter: string | null | undefined, number: number | null | undefined): string;
  parseRoomNumber(text: string): { value: number | null; error: string | null };
  findUeFieldErrors(doc: MapDoc, regions: Region[]): string[];
  buildExportDoc(doc: MapDoc, regions: Region[], types: FixedType[], defaults: StampCategories): MapDoc;
  findRegion(regions: Region[], name: string | null | undefined): Region | null;
  vocabOf(doc: MapDoc, types: FixedType[], defaults: StampCategories): Vocab;
  fillStampCategories<T extends MapDoc>(doc: T, defaults: StampCategories): T;
  stampCategoryProblems(doc: unknown): string[];
  migrateTypeData<T extends MapDoc>(doc: T, typesFile: TypesFile): T;
  importMethodOf(typeId: string | null | undefined, layer: ElementLayer, vocab: Vocab): ImportMethod;
  typesForLayer(vocab: Vocab, layer: ElementLayer): ElementType[];
  elementTypeOf(el: Typed, layer: ElementLayer, vocab: Vocab): ElementType | null;
  isBandType(typeId: string | null | undefined, vocab: Vocab): boolean;
  bandThicknessOf(typeId: string | null | undefined, vocab: Vocab): number | null;
  migrateTypeIds<T extends MapDoc>(doc: T, types: FixedType[], oldStampIds?: OldStampId[]): T;
  defaultElementName(layer: ElementLayer, n: number): string;
  chooseType<T extends Typed>(el: T, layer: ElementLayer, typeId: string, vocab: Vocab): T;
  manualMarkOf(el: Typed, layer: ElementLayer, vocab: Vocab): "manual" | "unclassified" | null;
  typePickerSections(vocab: Vocab, layer: ElementLayer): TypePickerSection[];
  stampCategorySections(vocab: Vocab): StampCategorySection[];
  autoNameOf(el: Typed, layer: ElementLayer, vocab: Vocab, withTier: boolean): string | null;
  submenuOfType(vocab: Vocab, type: StampType | null): StampSubmenu | null;
  tiersOfType(type: ElementType | null): StampTier[] | null;
  tierOf(el: Typed, layer: ElementLayer, vocab: Vocab): StampTier | null;
  chooseTier<T extends Typed>(el: T, layer: ElementLayer, tierId: string, vocab: Vocab): T;
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
    MVMapTypes?: TypesFile;
    MVMapUE?: UEApi;
  }
}

const missing = typeof window !== "undefined" && (!window.MVMapTypes || !window.MVMapUE);
if (missing) alert("mvmap-types.js / mvmap-ue.js not found — keep them in the same folder as index.html.");

export const UE = (typeof window !== "undefined" && window.MVMapUE) as UEApi;
export const TYPES_FILE: TypesFile = (typeof window !== "undefined" && window.MVMapTypes) || {
  regions: [],
  types: [],
  defaultStampCategories: { submenus: [], types: [] },
  oldStampIds: [],
};
export const REGIONS: Region[] = TYPES_FILE.regions;
/** How an import method reads in the UI: 中文 English, as every UE-facing name there. */
export const IMPORT_TEXT: Record<ImportMethod, string> = { auto: "自动生成 auto", manual: "只放占位 manual" };
/** The structure / edge types (stamp types are per document, in its stampCategories). */
export const FIXED_TYPES: FixedType[] = TYPES_FILE.types;

/** The element types of `doc`: the fixed structure / edge types plus its stamp categories (and the default ones, which
    give the import method). Kept while the document's categories object stays the same one, since rendering asks for
    it once per element: category edits, undo and loading all replace that object (mvmap-ue.js edits return a new
    document), never change it in place. */
let lastVocab: Vocab | null = null;
export function vocabOf(doc: MapDoc): Vocab {
  if (!lastVocab || !doc.stampCategories || lastVocab.stamp !== doc.stampCategories) {
    lastVocab = UE.vocabOf(doc, FIXED_TYPES, TYPES_FILE.defaultStampCategories);
  }
  return lastVocab;
}
