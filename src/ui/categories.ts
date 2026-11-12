/* Stamp category panel: a modal (top bar "Stamp 分类…") where designers add, rename, move and delete the map's stamp
   groups, types and tiers. Every edit is a pure function of mvmap-ue.js that returns the new document with its stamps
   repaired; the panel swaps it in as one undo step. It redraws on every commit while open, so undo / redo (Ctrl+Z / Y,
   or its own buttons) show up in it too. modals.ts opens it (this module stays free of modals.ts, which pulls in the
   renderer: panels.ts imports this one, and node tests import panels.ts through the store). */
import type { MapDoc, StampAnchor, StampType } from "../model/types.ts";
import { S, pushUndo, commit, undo, redo, undoStack, redoStack } from "../state/store.ts";
import { STAMP_EMOJI, STRUCT_COLORS, pickEmoji } from "../model/constants.ts";
import { UE, TYPES_FILE, type TierOwner, type StampUsageRef, type CategoryIdRef, type CategoryIdProblem } from "../ue.ts";
import { $, esc, newCategoryId } from "../util.ts";

const ANCHOR_TEXT: Record<StampAnchor, string> = { SnapToGround: "贴地", FloatInAir: "悬空" };

/* Ids: shown after each name as a button that renames it (mvmap-ue.js renameCategoryId). Ids of the default
   categories are locked: the UE side is configured for them. */
const DEFAULTS = TYPES_FILE.defaultStampCategories;
const ID_LOCKED_TIP = "默认分类里的 id，UE 侧已经按它配置，不能改";
const ID_TIP = "点击改 id：UE 侧按它配置生成物和图标，用到它的元素会一起改";
const ID_PROMPT = "新的 id：英文字母开头，只用字母、数字和 _（如 TreasureChest）。\nUE 侧按它配置生成物和图标（图标名 T_Emoji_MVMap_<id>），用到它的元素会一起改。";
const ID_PROBLEM_TEXT: Record<CategoryIdProblem, string> = {
  missing: "找不到这一项，可能已经被删除。",
  locked: ID_LOCKED_TIP + "。",
  format: "id 要以英文字母开头，只用字母、数字和 _。",
  taken: "这个 id 已经被用了：同一层里的另一项，或者元素上还留着的旧 id。",
};

/** Button showing an entry's id; a click renames it. `owner` is the group or type, or the tier's owner with `value`. */
function idButton(owner: TierOwner, value?: string): string {
  const ref: CategoryIdRef = value != null ? { ...owner, value } : owner;
  const id = value ?? owner.group ?? owner.type;
  const locked = UE.isCategoryIdLocked(ref, DEFAULTS);
  const valueAttr = value != null ? ` data-idvalue="${esc(value)}"` : "";
  // not `disabled`: a disabled button shows no tooltip in some browsers, and a click says why instead
  return `<button class="cat-id${locked ? " locked" : ""}" data-idowner="${esc(ownerKey(owner))}"${valueAttr} title="${locked ? ID_LOCKED_TIP : ID_TIP}">${esc(id)}</button>`;
}

/** Owner of a tier as a data attribute: "group:<id>" / "type:<id>". */
const ownerKey = (o: TierOwner) => (o.group != null ? "group:" + o.group : "type:" + o.type);
function ownerOf(key: string): TierOwner {
  const i = key.indexOf(":");
  const id = key.slice(i + 1);
  return key.slice(0, i) === "group" ? { group: id } : { type: id };
}

const cats = () => S.doc.stampCategories ?? { groups: [], types: [] };
const used = (ref: StampUsageRef) => UE.countStampsUsing(S.doc, ref);
const usedTag = (ref: StampUsageRef) => {
  const n = used(ref);
  return `<span class="sub cat-used" title="Stamps using it">${n ? n + " 个元素" : "未使用"}</span>`;
};

let pendingFocus: string | null = null;
let keepPanel = false;

/** Swaps in an edited document as one undo step; false (and no step) when the edit changes nothing.
    `focus`: data-k of the field to focus and select after the redraw, e.g. a just-added type's name.
    `keep`: don't redraw the panel for this edit. Text fields commit on blur, and a redraw at that moment would replace
    the button the user is clicking, losing the click; the field already shows the new text. */
function apply(next: MapDoc, opts: { focus?: string; keep?: boolean } = {}): boolean {
  if (JSON.stringify(next) === JSON.stringify(S.doc)) return false;
  pushUndo();
  S.doc = next;
  pendingFocus = opts.focus ?? null;
  keepPanel = !!opts.keep;
  commit();
  keepPanel = false;
  return true;
}

/** The group or group-less type a tier hangs on, the same one the tier edits change: a type inside a group has none. */
const tierHolder = (owner: TierOwner) => UE.stampTierOwner(S.doc, owner);

function tierHtml(owner: TierOwner): string {
  const ok = ownerKey(owner);
  const tier = tierHolder(owner)?.tier;
  if (!tier) {
    return `<div class="cat-tier"><button class="btn cat-small" data-addtier="${esc(ok)}" title="Elements must then pick one of its values">+ 档位</button></div>`;
  }
  const values = tier.values
    .map(
      (v) => `<span class="cat-val">
        <input type="text" data-k="vlabel:${esc(ok)}:${esc(v.id)}" data-vlabel="${esc(v.id)}" data-owner="${esc(ok)}" value="${esc(v.label)}" spellcheck="false" title="${used({ ...owner, value: v.id })} 个元素" />
        ${idButton(owner, v.id)}
        <button class="mini" data-delval="${esc(v.id)}" data-owner="${esc(ok)}" title="Delete this value">×</button>
      </span>`,
    )
    .join("");
  return `<div class="cat-tier">
      <span class="cat-k">档位</span>
      <input type="text" class="cat-tiername" data-k="tierlabel:${esc(ok)}" data-tierlabel="${esc(ok)}" value="${esc(tier.label)}" spellcheck="false" title="The tier's name: the title of its dropdown in the inspector" />
      <span class="cat-k">取值</span>
      ${values || `<span class="meta err">没有取值，元素选不完</span>`}
      <button class="btn cat-small" data-addval="${esc(ok)}">+ 取值</button>
      <button class="btn danger cat-small" data-deltier="${esc(ok)}">删除档位</button>
    </div>`;
}

function typeHtml(t: StampType): string {
  const groups = cats().groups;
  const gid = groups.some((g) => g.id === t.group) ? t.group : "";
  const id = esc(t.id);
  return `<div class="cat-type">
      <input type="text" class="cat-emoji" data-k="temoji:${id}" data-temoji="${id}" value="${esc(t.emoji)}" autocomplete="off" spellcheck="false" title="Emoji for new stamps of this type (Win + .); placed stamps keep theirs" />
      <input type="text" class="cat-name" data-k="tlabel:${id}" data-tlabel="${id}" value="${esc(t.label)}" spellcheck="false" />
      ${idButton({ type: t.id })}
      <input type="color" data-k="tcolor:${id}" data-tcolor="${id}" value="${esc(t.color)}" title="Colour for new stamps of this type; placed stamps keep theirs" />
      <select data-k="tgroup:${id}" data-tgroup="${id}" title="Group">
        <option value="" ${gid ? "" : "selected"}>（无大类）</option>
        ${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === gid ? "selected" : ""}>${esc(g.label)}</option>`).join("")}
      </select>
      <select data-k="tanchor:${id}" data-tanchor="${id}" title="Default anchor of new stamps">
        ${UE.STAMP_ANCHORS.map((a) => `<option value="${a}" ${UE.defaultStampAnchor(t) === a ? "selected" : ""}>${ANCHOR_TEXT[a]}</option>`).join("")}
      </select>
      <label class="check cat-lock" title="The type decides the anchor; the inspector hides the anchor dropdown"><input type="checkbox" data-k="tlock:${id}" data-tlock="${id}" ${t.anchorLocked ? "checked" : ""} /><span>锁定</span></label>
      <span class="cat-gen ${t.generate}" title="What the UE importer does with it (set on the UE side, read-only here)">${t.generate}</span>
      ${usedTag({ type: t.id })}
      <button class="mini" data-deltype="${id}" title="Delete this type">×</button>
    </div>`;
}

function panelHtml(): string {
  const c = cats();
  const known = new Set(c.groups.map((g) => g.id));
  const groups = c.groups
    .map((g) => {
      const members = c.types.filter((t) => t.group === g.id);
      return `<section class="cat-group">
        <div class="cat-head">
          <span class="cat-k">大类</span>
          <input type="text" class="cat-name" data-k="glabel:${esc(g.id)}" data-glabel="${esc(g.id)}" value="${esc(g.label)}" spellcheck="false" />
          ${idButton({ group: g.id })}
          ${usedTag({ group: g.id })}
          <span class="spacer"></span>
          <button class="btn cat-small" data-addtype="${esc(g.id)}">+ 类型</button>
          <button class="btn danger cat-small" data-delgroup="${esc(g.id)}">删除大类</button>
        </div>
        ${tierHtml({ group: g.id })}
        ${members.map(typeHtml).join("") || `<div class="meta">还没有类型：用"+ 类型"新建，或者在类型的大类下拉里选它。</div>`}
      </section>`;
    })
    .join("");
  const loose = c.types
    .filter((t) => !known.has(t.group ?? ""))
    .map((t) => `<div class="cat-loose">${typeHtml(t)}${tierHtml({ type: t.id })}</div>`)
    .join("");
  return `<div id="cat-panel">
    <div class="cat-top">
      <h2>Stamp 分类</h2>
      <span class="spacer"></span>
      <button class="tb" id="cat-undo" title="Undo (Ctrl+Z)" ${undoStack.length ? "" : "disabled"}>↶</button>
      <button class="tb" id="cat-redo" title="Redo (Ctrl+Y)" ${redoStack.length ? "" : "disabled"}>↷</button>
    </div>
    <p class="sub">这个地图自己的 stamp 分类，别的地图不受影响。改名不影响元素；删除时用到它的元素保留下来，变成未选完或未分类（标红）。
      emoji、颜色、默认 anchor 只用于之后新建的元素。generate 由 UE 侧决定，新建的类型是 manual：UE 侧改好之前只生成占位。
      名字后面是 id，UE 侧按它配置：新建的可以点开改成可读的英文（如 TreasureChest），默认分类里的锁定。</p>
    <div class="btn-row cat-actions">
      <button class="btn" id="cat-addtype">+ 类型</button>
      <button class="btn" id="cat-addgroup">+ 大类</button>
    </div>
    ${groups}
    <section class="cat-group">
      <div class="cat-head"><span class="cat-k">没有大类的类型</span></div>
      ${loose || `<div class="meta">没有。</div>`}
    </section>
    <div class="close-row"><button class="btn primary" data-close style="flex:0 0 auto;padding:6px 16px">Close</button></div>
  </div>`;
}

/** Text of a delete confirmation: what goes, how many stamps change, and `extra` lines for side effects. */
const confirmDelete = (what: string, n: number, after: string, extra: string[] = []) =>
  confirm([`${what}\n${n} 个元素在用${n ? `，删除后${after}` : ""}。`, ...extra].join("\n"));

/** "N 个元素的 anchor 回到贴地" when a delete gives stamps another anchor (their type locked it), else nothing. */
function anchorNote(next: MapDoc): string[] {
  const n = next.stamps.filter((st, i) => st.anchor !== S.doc.stamps[i].anchor).length;
  return n ? [`其中 ${n} 个元素的 anchor 回到贴地（原来由类型锁定）。`] : [];
}

function bind(box: HTMLElement): void {
  const all = <T extends HTMLElement>(sel: string) => box.querySelectorAll<T>(sel);
  const typeOf = (id: string) => cats().types.find((t) => t.id === id);
  const fresh = (prefix: string) => newCategoryId(UE.usedCategoryIds(S.doc), prefix);
  const addType = (group?: string) => {
    const id = fresh("Type");
    const n = cats().types.length;
    apply(
      UE.addStampType(S.doc, id, { label: "新类型", emoji: STAMP_EMOJI[n % STAMP_EMOJI.length], color: STRUCT_COLORS[n % STRUCT_COLORS.length], group }),
      { focus: "tlabel:" + id },
    );
  };
  $("#cat-addtype").onclick = () => addType();
  $("#cat-addgroup").onclick = () => {
    const id = fresh("Group");
    apply(UE.addStampGroup(S.doc, id, "新大类"), { focus: "glabel:" + id });
  };
  $("#cat-undo").onclick = undo;
  $("#cat-redo").onclick = redo;
  all("[data-addtype]").forEach((b) => (b.onclick = () => addType(b.dataset.addtype)));
  all<HTMLButtonElement>("[data-idowner]").forEach((b) => {
    b.onclick = () => {
      const owner = ownerOf(b.dataset.idowner!);
      const value = b.dataset.idvalue;
      const ref: CategoryIdRef = value != null ? { ...owner, value } : owner;
      const current = value ?? owner.group ?? owner.type;
      if (b.classList.contains("locked")) {
        alert(ID_PROBLEM_TEXT.locked);
        return;
      }
      const input = prompt(ID_PROMPT, current);
      const id = input?.trim();
      if (!id || id === current) return;
      const problem = UE.categoryIdProblem(S.doc, ref, id, DEFAULTS);
      if (problem) alert(ID_PROBLEM_TEXT[problem]);
      else apply(UE.renameCategoryId(S.doc, ref, id, DEFAULTS));
    };
  });

  /* Text fields commit on change (blur / Enter) without redrawing the panel (see apply). `edit` returns the edited
     document and the text the field should show (the emoji actually kept); null puts the stored text back. */
  const onText = (attr: string, stored: (el: HTMLInputElement) => string, edit: (el: HTMLInputElement, text: string) => [MapDoc, string] | null) =>
    all<HTMLInputElement>(`[data-${attr}]`).forEach((el) => {
      el.onchange = () => {
        const text = el.value.trim();
        const r = text ? edit(el, text) : null;
        if (r) apply(r[0], { keep: true });
        el.value = r ? r[1] : stored(el);
      };
      el.onkeydown = (e) => e.key === "Enter" && el.blur();
    });
  onText(
    "glabel",
    (el) => cats().groups.find((g) => g.id === el.dataset.glabel)?.label ?? "",
    (el, label) => {
      const id = el.dataset.glabel!;
      // the group dropdowns of the type rows show the name too
      all<HTMLOptionElement>(`[data-tgroup] option[value="${CSS.escape(id)}"]`).forEach((o) => (o.textContent = label));
      return [UE.updateStampGroup(S.doc, id, { label }), label];
    },
  );
  onText("tlabel", (el) => typeOf(el.dataset.tlabel!)?.label ?? "", (el, label) => [UE.updateStampType(S.doc, el.dataset.tlabel!, { label }), label]);
  onText(
    "tierlabel",
    (el) => tierHolder(ownerOf(el.dataset.tierlabel!))?.tier?.label ?? "",
    (el, label) => [UE.setStampTier(S.doc, ownerOf(el.dataset.tierlabel!), label), label],
  );
  onText(
    "vlabel",
    (el) => tierHolder(ownerOf(el.dataset.owner!))?.tier?.values.find((v) => v.id === el.dataset.vlabel)?.label ?? "",
    (el, label) => [UE.renameTierValue(S.doc, ownerOf(el.dataset.owner!), el.dataset.vlabel!, label), label],
  );
  // exactly one emoji, as in the stamp inspector: the last one typed is kept, text without an emoji is dropped
  onText(
    "temoji",
    (el) => typeOf(el.dataset.temoji!)?.emoji ?? "",
    (el, text) => {
      const e = pickEmoji(text);
      return e ? [UE.updateStampType(S.doc, el.dataset.temoji!, { emoji: e }), e] : null;
    },
  );

  all<HTMLInputElement>("[data-tcolor]").forEach((el) => (el.onchange = () => apply(UE.updateStampType(S.doc, el.dataset.tcolor!, { color: el.value }))));
  all<HTMLSelectElement>("[data-tanchor]").forEach(
    (el) => (el.onchange = () => apply(UE.updateStampType(S.doc, el.dataset.tanchor!, { anchor: el.value as StampAnchor }))),
  );
  all<HTMLInputElement>("[data-tlock]").forEach((el) => (el.onchange = () => apply(UE.updateStampType(S.doc, el.dataset.tlock!, { anchorLocked: el.checked }))));
  all<HTMLSelectElement>("[data-tgroup]").forEach((el) => {
    el.onchange = () => {
      const id = el.dataset.tgroup!;
      const t = typeOf(id);
      const next = UE.moveStampType(S.doc, id, el.value || null);
      // moving into a group drops the type's own tier; say so, with the stamps whose value actually goes
      const lost = next.stamps.filter((st, i) => st.tier !== S.doc.stamps[i].tier).length;
      if (t?.tier && el.value && !confirm(`移进大类后，「${t.label}」改用大类的档位，自己的档位「${t.tier.label}」删掉。\n${lost} 个元素选的取值会被清掉。`)) {
        renderCategoryPanel();
        return;
      }
      apply(next, { focus: "tgroup:" + id });
    };
  });

  all("[data-deltype]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.deltype!;
      const t = typeOf(id);
      if (!t) return;
      const g = cats().groups.find((x) => x.id === t.group);
      const after = g ? `保留大类「${g.label}」，变成未选完` : "变成未分类";
      const next = UE.removeStampType(S.doc, id);
      if (confirmDelete(`删除类型「${t.label}」？`, used({ type: id }), after, anchorNote(next))) apply(next);
    };
  });
  all("[data-delgroup]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.delgroup!;
      const g = cats().groups.find((x) => x.id === id);
      if (!g) return;
      const k = cats().types.filter((t) => t.group === id).length;
      const next = UE.removeStampGroup(S.doc, id);
      if (confirmDelete(`删除大类「${g.label}」${k ? `和它下面的 ${k} 个类型` : ""}？`, used({ group: id }), "变成未分类", anchorNote(next))) apply(next);
    };
  });
  all("[data-addtier]").forEach((b) => {
    b.onclick = () => apply(UE.setStampTier(S.doc, ownerOf(b.dataset.addtier!), "档位"), { focus: "tierlabel:" + b.dataset.addtier });
  });
  all("[data-deltier]").forEach((b) => {
    b.onclick = () => {
      const owner = ownerOf(b.dataset.deltier!);
      const holder = tierHolder(owner);
      if (!holder?.tier) return;
      if (confirmDelete(`删除档位「${holder.tier.label}」和它的全部取值？`, used({ ...owner, tier: true }), "这些元素选的取值被清掉"))
        apply(UE.removeStampTier(S.doc, owner));
    };
  });
  all("[data-addval]").forEach((b) => {
    b.onclick = () => {
      const ok = b.dataset.addval!;
      const id = fresh("Value");
      apply(UE.addTierValue(S.doc, ownerOf(ok), id, "新取值"), { focus: `vlabel:${ok}:${id}` });
    };
  });
  all("[data-delval]").forEach((b) => {
    b.onclick = () => {
      const owner = ownerOf(b.dataset.owner!);
      const tier = tierHolder(owner)?.tier;
      const v = tier?.values.find((x) => x.id === b.dataset.delval);
      if (!tier || !v) return;
      // the last value: the tier stays, empty, and every stamp picking from it is 未选完 until a value is added
      const last = tier.values.length === 1 ? [`这是「${tier.label}」的最后一个取值：删除后档位没有取值，用这个档位的元素都选不完（标红）。`] : [];
      if (confirmDelete(`删除取值「${v.label}」？`, used({ ...owner, value: v.id }), `变成"未选${tier.label}"`, last))
        apply(UE.removeTierValue(S.doc, owner, v.id));
    };
  });
}

/** Markup modals.ts opens the panel with; renderCategoryPanel fills it. */
export const CATEGORY_PANEL_SHELL = `<div id="cat-panel"></div>`;
const isOpen = () => !$("#modal").hidden && !!document.querySelector("#modal-box #cat-panel");

/** Redraws the panel when it is open (called on every commit), keeping the focused field and the scroll position. */
export function renderCategoryPanel(): void {
  if (!isOpen()) return;
  const box = $("#modal-box");
  if (keepPanel) {
    // the fields already show the edit; only the undo / redo buttons need it
    box.querySelector<HTMLButtonElement>("#cat-undo")!.disabled = !undoStack.length;
    box.querySelector<HTMLButtonElement>("#cat-redo")!.disabled = !redoStack.length;
    return;
  }
  const focusKey = pendingFocus ?? (document.activeElement as HTMLElement | null)?.dataset?.k ?? null;
  const select = pendingFocus != null;
  pendingFocus = null;
  const scroll = box.scrollTop;
  box.innerHTML = panelHtml();
  bind(box);
  box.scrollTop = scroll;
  if (focusKey) {
    const el = box.querySelector<HTMLElement>(`[data-k="${CSS.escape(focusKey)}"]`);
    el?.focus();
    if (select && el instanceof HTMLInputElement && el.type === "text") el.select();
    if (select) el?.scrollIntoView({ block: "nearest" });
  }
}
