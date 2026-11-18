/* Stamp category panel: a modal (top bar "Stamp 分类…") where designers add, rename, move and delete the map's stamp
   submenus, types and tiers. Every edit is a pure function of mvmap-ue.js that returns the new document with its stamps
   repaired; the panel swaps it in as one undo step. It redraws on every commit while open, so undo / redo (Ctrl+Z / Y,
   or its own buttons) show up in it too. modals.ts opens it (this module stays free of modals.ts, which pulls in the
   renderer: panels.ts imports this one, and node tests import panels.ts through the store). */
import type { MapDoc, StampAnchor, StampType } from "../model/types.ts";
import { S, pushUndo, commit, undo, redo, undoStack, redoStack } from "../state/store.ts";
import { STAMP_EMOJI, STRUCT_COLORS, pickEmoji } from "../model/constants.ts";
import { UE, TYPES_FILE, IMPORT_TEXT, vocabOf, type StampUsageRef, type CategoryIdRef, type CategoryIdProblem } from "../ue.ts";
import { $, esc, newCategoryId } from "../util.ts";

const ANCHOR_TEXT: Record<StampAnchor, string> = { SnapToGround: "贴地", FloatInAir: "悬空" };

/* Ids: shown after each type and tier name as a button that renames it (mvmap-ue.js renameCategoryId). Ids of the
   default categories are locked: the UE side is configured for them. Submenu ids aren't shown: UE doesn't read them. */
const DEFAULTS = TYPES_FILE.defaultStampCategories;
const ID_LOCKED_TIP = "默认分类里的 id，UE 侧已经按它配置，不能改";
const ID_TIP = "点击改 id：UE 侧按它配置生成物和图标，用到它的元素会一起改";
const ID_PROMPT = "新的 id：英文字母开头，只用字母、数字和 _（如 TreasureChest）。\nUE 侧按它配置生成物和图标（图标名 T_Emoji_MVMap_<id>），用到它的元素会一起改。";
const ID_PROBLEM_TEXT: Record<CategoryIdProblem, string> = {
  missing: "找不到这一项，可能已经被删除。",
  locked: ID_LOCKED_TIP + "。",
  format: "id 要以英文字母开头，只用字母、数字和 _。",
  taken: "这个 id 已经被用了：另一个类型（或同一类型的另一个档位），或者元素上还留着的旧 id。",
};

/** Button showing a type's id, or with `tier` one of its tiers' ids; a click renames it. */
function idButton(type: string, tier?: string): string {
  const ref: CategoryIdRef = tier != null ? { type, tier } : { type };
  const locked = UE.isCategoryIdLocked(ref, DEFAULTS);
  const tierAttr = tier != null ? ` data-idtier="${esc(tier)}"` : "";
  // not `disabled`: a disabled button shows no tooltip in some browsers, and a click says why instead
  return `<button class="cat-id${locked ? " locked" : ""}" data-idtype="${esc(type)}"${tierAttr} title="${locked ? ID_LOCKED_TIP : ID_TIP}">${esc(tier ?? type)}</button>`;
}

const cats = () => S.doc.stampCategories ?? { submenus: [], types: [] };
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

/** The tier row under a type: its tier label and tiers, or a button giving it some. */
function tiersHtml(t: StampType): string {
  const id = esc(t.id);
  const tiers = UE.tiersOfType(t);
  if (!tiers) {
    return `<div class="cat-tier"><button class="btn cat-small" data-addtiers="${id}" title="Its stamps must then pick one of them">+ 档位 Tier</button></div>`;
  }
  const items = tiers
    .map(
      (v) => `<span class="cat-val">
        <input type="text" data-k="vlabel:${id}:${esc(v.id)}" data-vlabel="${esc(v.id)}" data-type="${id}" value="${esc(v.label)}" spellcheck="false" title="${used({ type: t.id, tier: v.id })} 个元素" />
        ${idButton(t.id, v.id)}
        <button class="mini" data-deltier="${esc(v.id)}" data-type="${id}" title="Delete this tier">×</button>
      </span>`,
    )
    .join("");
  return `<div class="cat-tier">
      <span class="cat-k">档位名 Tier label</span>
      <input type="text" class="cat-tiername" data-k="tierlabel:${id}" data-tierlabel="${id}" value="${esc(t.tierLabel ?? "")}" spellcheck="false" title="The title of the tier dropdown in the inspector (档位 Tier · 强弱)" />
      <span class="cat-k">档位 Tier</span>
      ${items || `<span class="meta err">没有档位，元素选不完</span>`}
      <button class="btn cat-small" data-addtier="${id}">+ 档位 Tier</button>
      <button class="btn danger cat-small" data-deltiers="${id}">删除全部档位 Delete tiers</button>
    </div>`;
}

function typeHtml(t: StampType): string {
  const vocab = vocabOf(S.doc);
  const sid = UE.submenuOfType(vocab, t)?.id ?? "";
  const id = esc(t.id);
  const method = UE.importMethodOf(t.id, "stamp", vocab);
  return `<div class="cat-entry"><div class="cat-type">
      <input type="text" class="cat-emoji" data-k="temoji:${id}" data-temoji="${id}" value="${esc(t.emoji)}" autocomplete="off" spellcheck="false" title="Emoji for new stamps of this type (Win + .); placed stamps keep theirs" />
      <input type="text" class="cat-name" data-k="tlabel:${id}" data-tlabel="${id}" value="${esc(t.label)}" spellcheck="false" />
      ${idButton(t.id)}
      <input type="color" data-k="tcolor:${id}" data-tcolor="${id}" value="${esc(t.color)}" title="Colour for new stamps of this type; placed stamps keep theirs" />
      <select data-k="tsubmenu:${id}" data-tsubmenu="${id}" title="子菜单 Submenu: where it is listed in the Type dropdown">
        <option value="" ${sid ? "" : "selected"}>（不在子菜单里 No submenu）</option>
        ${vocab.stamp.submenus.map((s) => `<option value="${esc(s.id)}" ${s.id === sid ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
      </select>
      <select data-k="tanchor:${id}" data-tanchor="${id}" title="Default anchor of new stamps">
        ${UE.STAMP_ANCHORS.map((a) => `<option value="${a}" ${UE.defaultStampAnchor(t) === a ? "selected" : ""}>${ANCHOR_TEXT[a]}</option>`).join("")}
      </select>
      <label class="check cat-lock" title="The type decides the anchor; the inspector hides the anchor dropdown"><input type="checkbox" data-k="tlock:${id}" data-tlock="${id}" ${t.anchorLocked ? "checked" : ""} /><span>锁定</span></label>
      <span class="cat-import ${method}" title="导入方式 Import: what the UE importer does with it. Decided on the UE side, read-only here">${IMPORT_TEXT[method]}</span>
      ${usedTag({ type: t.id })}
      <button class="mini" data-deltype="${id}" title="Delete this type">×</button>
    </div>${tiersHtml(t)}</div>`;
}

function panelHtml(): string {
  const [loose, ...inSubmenus] = UE.stampCategorySections(vocabOf(S.doc));
  const submenus = inSubmenus
    .map(({ submenu: s, types: members }) => {
      if (!s) return "";
      return `<section class="cat-section">
        <div class="cat-head">
          <span class="cat-k">子菜单 Submenu</span>
          <input type="text" class="cat-name" data-k="slabel:${esc(s.id)}" data-slabel="${esc(s.id)}" value="${esc(s.label)}" spellcheck="false" />
          <span class="spacer"></span>
          <button class="btn cat-small" data-addtype="${esc(s.id)}">+ 类型 Type</button>
          <button class="btn danger cat-small" data-delsubmenu="${esc(s.id)}">删除子菜单 Delete submenu</button>
        </div>
        ${members.map(typeHtml).join("") || `<div class="meta">还没有类型：用"+ 类型 Type"新建，或者在类型的子菜单下拉里选它。空的子菜单不出现在 Inspector 的类型下拉里。</div>`}
      </section>`;
    })
    .join("");
  return `<div id="cat-panel">
    <div class="cat-top">
      <h2>Stamp 分类</h2>
      <span class="spacer"></span>
      <button class="tb" id="cat-undo" title="Undo (Ctrl+Z)" ${undoStack.length ? "" : "disabled"}>↶</button>
      <button class="tb" id="cat-redo" title="Redo (Ctrl+Y)" ${redoStack.length ? "" : "disabled"}>↷</button>
    </div>
    <p class="sub">这个地图自己的 stamp 分类，别的地图不受影响。和 UE 的 StampTypes 一一对应：类型 Type 是 StampTypes 的 key，档位 Tier 是它下面 Tiers 的 key；
      档位名 Tier label 只是 Inspector 里档位下拉的标题。</p>
    <p class="sub">子菜单 Submenu 只用于在 Inspector 的类型下拉里收纳几个类型（如"敌人"下面是近战、远程、飞行），不导出给 UE；把类型移进移出、删除子菜单都不影响元素。
      每个类型的档位各管各的，给近战加档位不影响飞行。</p>
    <p class="sub">改名不影响元素；删除类型或档位时，用到它的元素保留下来，变成未分类或未选完（标红）。emoji、颜色、默认 anchor 只用于之后新建的元素。
      导入方式 Import（自动生成 auto / 只放占位 manual）由 UE 侧决定，这里只读：新建的类型是只放占位，UE 侧支持以后程序会把它改成自动生成。
      名字后面是 id，UE 侧按它配置：新建的可以点开改成可读的英文（如 TreasureChest），默认分类里的锁定。</p>
    <div class="btn-row cat-actions">
      <button class="btn" id="cat-addtype">+ 类型 Type</button>
      <button class="btn" id="cat-addsubmenu">+ 子菜单 Submenu</button>
    </div>
    <section class="cat-section">
      <div class="cat-head"><span class="cat-k">不在子菜单里的类型 Types without a submenu</span></div>
      ${loose.types.map(typeHtml).join("") || `<div class="meta">没有。</div>`}
    </section>
    ${submenus}
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
  const addType = (submenu?: string) => {
    const id = fresh("Type");
    const n = cats().types.length;
    apply(
      UE.addStampType(S.doc, id, { label: "新类型", emoji: STAMP_EMOJI[n % STAMP_EMOJI.length], color: STRUCT_COLORS[n % STRUCT_COLORS.length], submenu }),
      { focus: "tlabel:" + id },
    );
  };
  $("#cat-addtype").onclick = () => addType();
  $("#cat-addsubmenu").onclick = () => {
    const id = fresh("Submenu");
    apply(UE.addStampSubmenu(S.doc, id, "新子菜单"), { focus: "slabel:" + id });
  };
  $("#cat-undo").onclick = undo;
  $("#cat-redo").onclick = redo;
  all("[data-addtype]").forEach((b) => (b.onclick = () => addType(b.dataset.addtype)));
  all<HTMLButtonElement>("[data-idtype]").forEach((b) => {
    b.onclick = () => {
      const type = b.dataset.idtype!;
      const tier = b.dataset.idtier;
      const ref: CategoryIdRef = tier != null ? { type, tier } : { type };
      const current = tier ?? type;
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
    "slabel",
    (el) => cats().submenus.find((s) => s.id === el.dataset.slabel)?.label ?? "",
    (el, label) => {
      const id = el.dataset.slabel!;
      // the submenu dropdowns of the type rows show the name too
      all<HTMLOptionElement>(`[data-tsubmenu] option[value="${CSS.escape(id)}"]`).forEach((o) => (o.textContent = label));
      return [UE.updateStampSubmenu(S.doc, id, { label }), label];
    },
  );
  onText("tlabel", (el) => typeOf(el.dataset.tlabel!)?.label ?? "", (el, label) => [UE.updateStampType(S.doc, el.dataset.tlabel!, { label }), label]);
  onText(
    "tierlabel",
    (el) => typeOf(el.dataset.tierlabel!)?.tierLabel ?? "",
    (el, label) => [UE.setStampTierLabel(S.doc, el.dataset.tierlabel!, label), label],
  );
  onText(
    "vlabel",
    (el) => typeOf(el.dataset.type!)?.tiers?.find((v) => v.id === el.dataset.vlabel)?.label ?? "",
    (el, label) => [UE.renameStampTier(S.doc, el.dataset.type!, el.dataset.vlabel!, label), label],
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
  // moving a type only changes where the Type dropdown lists it: its tiers and its stamps stay
  all<HTMLSelectElement>("[data-tsubmenu]").forEach((el) => {
    el.onchange = () => apply(UE.moveStampType(S.doc, el.dataset.tsubmenu!, el.value || null), { focus: "tsubmenu:" + el.dataset.tsubmenu });
  });

  all("[data-deltype]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.deltype!;
      const t = typeOf(id);
      if (!t) return;
      const next = UE.removeStampType(S.doc, id);
      if (confirmDelete(`删除类型「${t.label}」？`, used({ type: id }), "变成未分类", anchorNote(next))) apply(next);
    };
  });
  all("[data-delsubmenu]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.delsubmenu!;
      const section = UE.stampCategorySections(vocabOf(S.doc)).find((x) => x.submenu?.id === id);
      const s = section?.submenu;
      if (!s) return;
      const k = section.types.length;
      const kept = k ? `它下面的 ${k} 个类型留下，移到"不在子菜单里"。` : "";
      if (confirm(`删除子菜单「${s.label}」？\n${kept}元素不受影响。`)) apply(UE.removeStampSubmenu(S.doc, id));
    };
  });
  all("[data-addtiers]").forEach((b) => {
    b.onclick = () => apply(UE.setStampTierLabel(S.doc, b.dataset.addtiers!, "档位"), { focus: "tierlabel:" + b.dataset.addtiers });
  });
  all("[data-deltiers]").forEach((b) => {
    b.onclick = () => {
      const t = typeOf(b.dataset.deltiers!);
      if (!t?.tiers) return;
      if (confirmDelete(`删除「${t.label}」的档位名「${t.tierLabel}」和全部档位？`, used({ type: t.id, tiers: true }), "这些元素选的档位被清掉"))
        apply(UE.removeStampTiers(S.doc, t.id));
    };
  });
  all("[data-addtier]").forEach((b) => {
    b.onclick = () => {
      const type = b.dataset.addtier!;
      const id = fresh("Tier");
      apply(UE.addStampTier(S.doc, type, id, "新档位"), { focus: `vlabel:${type}:${id}` });
    };
  });
  all("[data-deltier]").forEach((b) => {
    b.onclick = () => {
      const t = typeOf(b.dataset.type!);
      const v = t?.tiers?.find((x) => x.id === b.dataset.deltier);
      if (!t?.tiers || !v) return;
      // the last tier: the tier label stays, and every stamp of the type is 未选完 until a tier is added
      const last = t.tiers.length === 1 ? [`这是「${t.label}」的最后一个档位：删除后没有档位可选，这个类型的元素都选不完（标红）。`] : [];
      if (confirmDelete(`删除档位「${v.label}」？`, used({ type: t.id, tier: v.id }), `变成"未选${t.tierLabel}"`, last))
        apply(UE.removeStampTier(S.doc, t.id, v.id));
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
