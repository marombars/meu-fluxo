"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessLead, isManager, isOwner, requirePerm, type User } from "../auth";
import { one, q } from "../db";
import { audit } from "../audit";
import { BOARD_COLORS, BOARD_TEMPLATES, CARD_LABEL_IDS, channelsFromForm, isHexColor, PERIODS, tileColor } from "../boards";

type FormState = { error?: string; ok?: string } | undefined;
const UUID = /^[0-9a-f-]{36}$/i;
const txt = (v: FormDataEntryValue | null, max: number) => { const s = String(v ?? "").trim().slice(0, max); return s || null; };
const uuid = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return UUID.test(s) ? s : null; };
const isoOrNull = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString(); };

async function loadBoard(id: string | null) {
  if (!id) throw new Error("Quadro inválido.");
  const b = await one<any>(`SELECT * FROM boards WHERE id = $1`, [id]);
  if (!b) throw new Error("Quadro não encontrado.");
  return b;
}
async function loadCard(id: string | null) {
  if (!id) throw new Error("Cartão inválido.");
  const c = await one<any>(`SELECT * FROM board_cards WHERE id = $1`, [id]);
  if (!c) throw new Error("Cartão não encontrado.");
  return c;
}
/** Só liga um cartão/quadro a um lead a que o utilizador tem acesso. */
async function safeLead(user: User, v: FormDataEntryValue | null) {
  const id = uuid(v);
  if (!id) return null;
  return (await canAccessLead(user, id)) ? id : null;
}
const canManageBoard = (user: User, b: any) => isOwner(user) || isManager(user) || b.created_by === user.id;
async function log(cardId: string, userId: string, body: string) {
  await q(`INSERT INTO board_card_comments (card_id, user_id, kind, body) VALUES ($1,$2,'sistema',$3)`, [cardId, userId, body.slice(0, 500)]);
}
async function leadActivity(leadId: string | null, userId: string, content: string) {
  if (leadId) await q(`INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1,$2,'sistema',$3)`, [leadId, userId, content]);
}
function touch(boardId: string, leadId?: string | null) {
  revalidatePath(`/quadros/${boardId}`);
  revalidatePath(`/quadros`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** Tipo de conteúdo escolhido (ou nova categoria criada na hora). */
async function resolveContentType(fd: FormData, userId: string) {
  const v = String(fd.get("content_type") || "");
  if (v === "__novo__") {
    const name = txt(fd.get("content_type_new"), 60);
    if (!name) return null;
    await q(`INSERT INTO content_types (name, created_by) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, [name, userId]);
    return name;
  }
  if (!v) return null;
  return (await one(`SELECT 1 FROM content_types WHERE name = $1`, [v])) ? v : null;
}

// ---------- Plano de entregas do cliente (quantidades por período) ----------
/** Lê os campos do plano. Estilos: vários (separados por "|"), "*" = todos os estilos. */
async function parsePlan(fd: FormData, userId: string): Promise<{ error: string } | { styles: string; qty: number; period: string; start: string | null; end: string | null }> {
  const known = (await q<{ name: string }>(`SELECT name FROM content_types`)).map((r) => r.name);
  let styles = Array.from(new Set(fd.getAll("styles").map(String).filter((v) => v === "*" || known.includes(v))));
  const extra = txt(fd.get("content_type_new"), 60);
  if (extra) {
    await q(`INSERT INTO content_types (name, created_by) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, [extra.replace(/\|/g, "/"), userId]);
    styles.push(extra.replace(/\|/g, "/"));
  }
  if (styles.includes("*")) styles = ["*"];
  if (!styles.length) return { error: "Escolha pelo menos um estilo (ou escreva uma nova categoria)." };
  const qty = Number(String(fd.get("quantity") || "").replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return { error: "Indique uma quantidade válida." };
  const period = String(fd.get("period"));
  if (!PERIODS.some((p) => p.id === period)) return { error: "Período inválido." };
  const d = (k: string) => { const v = String(fd.get(k) || ""); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const start = d("start_date"), end = d("end_date");
  if (period === "contrato" && (!start || !end)) return { error: "Para “no total”, indique a data de início e de fim." };
  if (start && end && end < start) return { error: "A data de fim é anterior à de início." };
  return { styles: styles.join("|"), qty, period, start, end };
}
const stylesLabel = (s: string) => (s === "*" ? "todos os estilos" : s.split("|").join(" + "));

export async function addPlanItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const leadId = await safeLead(user, fd.get("lead_id"));
  if (!leadId) return { error: "Lead inválido." };
  const r = await parsePlan(fd, user.id);
  if ("error" in r) return r;
  await q(`INSERT INTO lead_content_plan (lead_id, content_type, quantity, period, start_date, end_date, channels, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [leadId, r.styles, r.qty, r.period, r.start, r.end, channelsFromForm(fd.getAll("channels")), txt(fd.get("notes"), 500), user.id]);
  await leadActivity(leadId, user.id, `Plano de entregas: ${r.qty.toLocaleString("pt-PT")} × ${stylesLabel(r.styles)} ${PERIODS.find((p) => p.id === r.period)!.label}.`);
  revalidatePath(`/leads/${leadId}`);
  return { ok: "Adicionado ao plano." };
}

export async function updatePlanItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const it = id ? await one<any>(`SELECT * FROM lead_content_plan WHERE id=$1`, [id]) : null;
  if (!it || !(await canAccessLead(user, it.lead_id))) return { error: "Item não encontrado." };
  const r = await parsePlan(fd, user.id);
  if ("error" in r) return r;
  await q(`UPDATE lead_content_plan SET content_type=$2, quantity=$3, period=$4, start_date=$5, end_date=$6, channels=$7, notes=$8 WHERE id=$1`,
    [it.id, r.styles, r.qty, r.period, r.start, r.end, channelsFromForm(fd.getAll("channels")), txt(fd.get("notes"), 500)]);
  await leadActivity(it.lead_id, user.id, `Plano de entregas alterado: ${r.qty.toLocaleString("pt-PT")} × ${stylesLabel(r.styles)} ${PERIODS.find((p) => p.id === r.period)!.label}.`);
  revalidatePath(`/leads/${it.lead_id}`);
  return { ok: "Plano atualizado." };
}

export async function deletePlanItemAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const it = id ? await one<any>(`SELECT * FROM lead_content_plan WHERE id=$1`, [id]) : null;
  if (!it || !(await canAccessLead(user, it.lead_id))) return;
  await q(`DELETE FROM lead_content_plan WHERE id=$1`, [it.id]);
  await leadActivity(it.lead_id, user.id, `Removido do plano de entregas: ${stylesLabel(it.content_type)}.`);
  revalidatePath(`/leads/${it.lead_id}`);
}

// ---------- Quadros ----------
async function createLists(boardId: string, template: string) {
  const t = BOARD_TEMPLATES[template] || BOARD_TEMPLATES.conteudo;
  let i = 0;
  for (const [name, done] of t.lists) await q(`INSERT INTO board_lists (board_id, name, position, is_done) VALUES ($1,$2,$3,$4)`, [boardId, name, i++, done]);
}

export async function createBoardAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const name = txt(fd.get("name"), 120);
  if (!name) return { error: "Dê um nome ao quadro." };
  const color = isHexColor(String(fd.get("color"))) ? String(fd.get("color")) : BOARD_COLORS[0];
  const leadId = await safeLead(user, fd.get("lead_id"));
  const b = await one<any>(`INSERT INTO boards (name, description, color, lead_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, txt(fd.get("description"), 1000), color, leadId, user.id]);
  await createLists(b.id, String(fd.get("template") || "conteudo"));
  await audit(user.id, "quadro_criado", "board", b.id, { name });
  await leadActivity(leadId, user.id, `Quadro criado: ${name}`);
  redirect(`/quadros/${b.id}`);
}

/** Cria (ou abre) o quadro de entregáveis de um cliente a partir da ficha do lead. */
export async function createLeadBoardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const leadId = await safeLead(user, fd.get("lead_id"));
  if (!leadId) throw new Error("Lead inválido.");
  const existing = await one<any>(`SELECT id FROM boards WHERE lead_id = $1 AND NOT archived ORDER BY created_at LIMIT 1`, [leadId]);
  if (existing) redirect(`/quadros/${existing.id}`);
  const lead = await one<any>(`SELECT name, company FROM leads WHERE id = $1`, [leadId]);
  const name = `Entregáveis — ${lead.company || lead.name}`;
  const b = await one<any>(`INSERT INTO boards (name, color, lead_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id`, [name, "#0f766e", leadId, user.id]);
  await createLists(b.id, "entregaveis");
  await audit(user.id, "quadro_criado", "board", b.id, { name, lead: leadId });
  await leadActivity(leadId, user.id, `Quadro de entregáveis criado.`);
  redirect(`/quadros/${b.id}`);
}

export async function updateBoardAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const b = await loadBoard(uuid(fd.get("id")));
  const name = txt(fd.get("name"), 120);
  if (!name) return { error: "O nome é obrigatório." };
  const color = isHexColor(String(fd.get("color"))) ? String(fd.get("color")) : b.color;
  const leadId = fd.get("lead_id") === "" ? null : (await safeLead(user, fd.get("lead_id"))) ?? b.lead_id;
  await q(`UPDATE boards SET name=$2, description=$3, color=$4, lead_id=$5, updated_at=now() WHERE id=$1`, [b.id, name, txt(fd.get("description"), 1000), color, leadId]);
  touch(b.id, leadId);
  return { ok: "Quadro atualizado." };
}

export async function archiveBoardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const b = await loadBoard(uuid(fd.get("id")));
  if (!canManageBoard(user, b)) throw new Error("Só quem criou o quadro ou um gestor o pode arquivar.");
  await q(`UPDATE boards SET archived = NOT archived, updated_at=now() WHERE id=$1`, [b.id]);
  await audit(user.id, b.archived ? "quadro_restaurado" : "quadro_arquivado", "board", b.id);
  touch(b.id);
  if (!b.archived) redirect("/quadros");
}

export async function deleteBoardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const b = await loadBoard(uuid(fd.get("id")));
  if (!(isOwner(user) || user.role === "admin" || b.created_by === user.id)) throw new Error("Sem permissão para apagar este quadro.");
  await q(`DELETE FROM boards WHERE id=$1`, [b.id]);
  await audit(user.id, "quadro_apagado", "board", b.id, { name: b.name });
  revalidatePath("/quadros");
  redirect("/quadros");
}

// ---------- Listas ----------
export async function createListAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const b = await loadBoard(uuid(fd.get("board_id")));
  const name = txt(fd.get("name"), 80);
  if (!name) return;
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_lists WHERE board_id=$1`, [b.id]);
  await q(`INSERT INTO board_lists (board_id, name, position) VALUES ($1,$2,$3)`, [b.id, name, pos.p]);
  await audit(user.id, "lista_criada", "board", b.id, { name });
  touch(b.id);
}

export async function updateListAction(fd: FormData) {
  await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const l = id ? await one<any>(`SELECT * FROM board_lists WHERE id=$1`, [id]) : null;
  if (!l) return;
  const op = String(fd.get("op"));
  if (op === "rename") { const name = txt(fd.get("name"), 80); if (name) await q(`UPDATE board_lists SET name=$2 WHERE id=$1`, [l.id, name]); }
  else if (op === "done") await q(`UPDATE board_lists SET is_done = NOT is_done WHERE id=$1`, [l.id]);
  else if (op === "archive") await q(`UPDATE board_lists SET archived = NOT archived WHERE id=$1`, [l.id]);
  else if (op === "color") { const c = String(fd.get("color") || ""); await q(`UPDATE board_lists SET color=$2 WHERE id=$1`, [l.id, tileColor(c) ? c : null]); }
  else if (op === "left" || op === "right") {
    const lists = await q<any>(`SELECT id FROM board_lists WHERE board_id=$1 AND NOT archived ORDER BY position, created_at`, [l.board_id]);
    const i = lists.findIndex((x) => x.id === l.id), j = op === "left" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < lists.length) {
      [lists[i], lists[j]] = [lists[j], lists[i]];
      for (let k = 0; k < lists.length; k++) await q(`UPDATE board_lists SET position=$2 WHERE id=$1`, [lists[k].id, k]);
    }
  }
  touch(l.board_id);
}

// ---------- Cartões ----------
export async function createCardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const listId = uuid(fd.get("list_id"));
  const l = listId ? await one<any>(`SELECT * FROM board_lists WHERE id=$1`, [listId]) : null;
  if (!l) throw new Error("Lista inválida.");
  const title = txt(fd.get("title"), 300);
  if (!title) return;
  const b = await loadBoard(l.board_id);
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_cards WHERE list_id=$1`, [l.id]);
  const c = await one<any>(`INSERT INTO board_cards (board_id, list_id, title, position, lead_id, created_by, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [l.board_id, l.id, title, pos.p, b.lead_id, user.id, l.is_done ? new Date().toISOString() : null]);
  await log(c.id, user.id, `criou este cartão em ${l.name}`);
  touch(l.board_id, b.lead_id);
}

/** Entregável criado na ficha do lead (cliente ganho): vai para a 1.ª lista do quadro escolhido. */
export async function addDeliverableAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const leadId = await safeLead(user, fd.get("lead_id"));
  if (!leadId) return { error: "Lead inválido." };
  const title = txt(fd.get("title"), 300);
  if (!title) return { error: "Escreva o entregável." };
  const b = await loadBoard(uuid(fd.get("board_id")));
  const l = await one<any>(`SELECT * FROM board_lists WHERE board_id=$1 AND NOT archived ORDER BY position LIMIT 1`, [b.id]);
  if (!l) return { error: "O quadro escolhido não tem listas." };
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_cards WHERE list_id=$1`, [l.id]);
  const postAt = isoOrNull(fd.get("post_at")), dueAt = isoOrNull(fd.get("due_at"));
  const ch = channelsFromForm(fd.getAll("post_channel"));
  const ctype = await resolveContentType(fd, user.id);
  const c = await one<any>(
    `INSERT INTO board_cards (board_id, list_id, title, position, lead_id, post_at, post_channel, due_at, created_by, content_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [b.id, l.id, title, pos.p, leadId, postAt, ch, dueAt, user.id, ctype]);
  await q(`INSERT INTO board_card_members (card_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.id, user.id]);
  await log(c.id, user.id, `criou este entregável a partir da ficha do cliente`);
  await leadActivity(leadId, user.id, `Entregável adicionado: ${title}`);
  touch(b.id, leadId);
  return { ok: "Entregável adicionado." };
}

/** Arrastar e largar: grava a nova lista e a ordem dos cartões. */
export async function moveCardAction(cardId: string, toListId: string, orderedIds: string[]) {
  const user = await requirePerm("quadros");
  const c = await loadCard(UUID.test(cardId) ? cardId : null);
  const to = UUID.test(toListId) ? await one<any>(`SELECT * FROM board_lists WHERE id=$1 AND board_id=$2`, [toListId, c.board_id]) : null;
  if (!to) throw new Error("Lista inválida.");
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).filter((x) => typeof x === "string" && UUID.test(x)).slice(0, 2000);
  await q(`UPDATE board_cards SET list_id=$2, updated_at=now() WHERE id=$1`, [c.id, to.id]);
  for (let i = 0; i < ids.length; i++) await q(`UPDATE board_cards SET position=$3 WHERE id=$1 AND list_id=$2`, [ids[i], to.id, i]);
  if (c.list_id !== to.id) await afterListChange(user, c, to);
  touch(c.board_id, c.lead_id);
}

async function afterListChange(user: User, c: any, to: any) {
  await log(c.id, user.id, `moveu este cartão para ${to.name}`);
  if (to.is_done && !c.completed_at) {
    await q(`UPDATE board_cards SET completed_at = now() WHERE id=$1`, [c.id]);
    await leadActivity(c.lead_id, user.id, `Entregável concluído: ${c.title}`);
  } else if (!to.is_done && c.completed_at) {
    const from = await one<any>(`SELECT is_done FROM board_lists WHERE id=$1`, [c.list_id]);
    if (from?.is_done) await q(`UPDATE board_cards SET completed_at = NULL WHERE id=$1`, [c.id]);
  }
}

export async function setCardListAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const to = await one<any>(`SELECT * FROM board_lists WHERE id=$1 AND board_id=$2`, [uuid(fd.get("list_id")), c.board_id]);
  if (!to || to.id === c.list_id) return;
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_cards WHERE list_id=$1`, [to.id]);
  await q(`UPDATE board_cards SET list_id=$2, position=$3, updated_at=now() WHERE id=$1`, [c.id, to.id, pos.p]);
  await afterListChange(user, c, to);
  touch(c.board_id, c.lead_id);
}

/** Move o cartão para outro quadro (ex.: cadastrado no cliente errado). Ajusta a lista, o cliente e a posição. */
export async function moveCardToBoardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const dest = await loadBoard(uuid(fd.get("board_id")));
  if (dest.id === c.board_id) return;
  // lista de destino: a com o mesmo nome da atual; senão, a primeira do quadro
  const from = await one<any>(`SELECT name FROM board_lists WHERE id=$1`, [c.list_id]);
  const to =
    (from && await one<any>(`SELECT * FROM board_lists WHERE board_id=$1 AND NOT archived AND lower(name)=lower($2) ORDER BY position LIMIT 1`, [dest.id, from.name])) ||
    await one<any>(`SELECT * FROM board_lists WHERE board_id=$1 AND NOT archived ORDER BY position, created_at LIMIT 1`, [dest.id]);
  if (!to) throw new Error("O quadro de destino não tem listas.");
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_cards WHERE list_id=$1`, [to.id]);
  const oldLead = c.lead_id;
  // entregáveis seguem o cliente do quadro de destino
  const newLead = dest.lead_id ?? c.lead_id;
  await q(`UPDATE board_cards SET board_id=$2, list_id=$3, position=$4, lead_id=$5, updated_at=now() WHERE id=$1`, [c.id, dest.id, to.id, pos.p, newLead]);
  // mantém o estado de concluído coerente com a lista de destino
  if (to.is_done && !c.completed_at) await q(`UPDATE board_cards SET completed_at = now() WHERE id=$1`, [c.id]);
  else if (!to.is_done && c.completed_at) await q(`UPDATE board_cards SET completed_at = NULL WHERE id=$1`, [c.id]);
  await log(c.id, user.id, `moveu este cartão para o quadro “${dest.name}” (lista ${to.name})`);
  if (oldLead && oldLead !== newLead) await leadActivity(oldLead, user.id, `Entregável movido para outro quadro: ${c.title}`);
  if (newLead && newLead !== oldLead) await leadActivity(newLead, user.id, `Entregável recebido de outro quadro: ${c.title}`);
  await audit(user.id, "cartao_movido_quadro", "board_card", c.id, { from: c.board_id, to: dest.id });
  touch(c.board_id, oldLead);
  touch(dest.id, newLead);
  redirect(`/quadros/${dest.id}?card=${c.id}`);
}

export async function updateCardAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const title = txt(fd.get("title"), 300);
  if (!title) return { error: "O título é obrigatório." };
  const leadId = fd.get("lead_id") === "" ? null : (await safeLead(user, fd.get("lead_id"))) ?? c.lead_id;
  const postAt = isoOrNull(fd.get("post_at"));
  const ch = channelsFromForm(fd.getAll("post_channel"));
  const ctype = await resolveContentType(fd, user.id);
  const dueAt = isoOrNull(fd.get("due_at"));
  const postChanged = String(postAt) !== String(c.post_at ? new Date(c.post_at).toISOString() : null);
  await q(
    `UPDATE board_cards SET title=$2, description=$3, lead_id=$4, post_at=$5, post_channel=$6, due_at=$7,
       post_reminder_sent_at = CASE WHEN $8 THEN NULL ELSE post_reminder_sent_at END, content_type=$9, updated_at=now() WHERE id=$1`,
    [c.id, title, txt(fd.get("description"), 10000), leadId, postAt, ch, dueAt, postChanged, ctype]);
  if (postChanged) await log(c.id, user.id, postAt ? `definiu a data de postagem` : `removeu a data de postagem`);
  if (leadId && leadId !== c.lead_id) await leadActivity(leadId, user.id, `Entregável ligado a este cliente: ${title}`);
  touch(c.board_id, leadId || c.lead_id);
  return { ok: "Guardado." };
}

export async function toggleLabelAction(fd: FormData) {
  await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const label = String(fd.get("label"));
  if (!CARD_LABEL_IDS.includes(label)) return;
  const labels: string[] = c.labels || [];
  const next = labels.includes(label) ? labels.filter((x) => x !== label) : [...labels, label];
  await q(`UPDATE board_cards SET labels=$2, updated_at=now() WHERE id=$1`, [c.id, next]);
  touch(c.board_id);
}

export async function toggleMemberAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const uid = uuid(fd.get("user_id"));
  const u = uid ? await one<any>(`SELECT id, name FROM users WHERE id=$1 AND active`, [uid]) : null;
  if (!u) return;
  const del = await q(`DELETE FROM board_card_members WHERE card_id=$1 AND user_id=$2 RETURNING user_id`, [c.id, u.id]);
  if (!del.length) await q(`INSERT INTO board_card_members (card_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.id, u.id]);
  await log(c.id, user.id, del.length ? `removeu ${u.name} do cartão` : `adicionou ${u.name} ao cartão`);
  touch(c.board_id);
}

/** “Publicado”: resolve a notificação de postagem (também usado no sino). */
export async function markPostedAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const undo = fd.get("undo") === "1";
  await q(`UPDATE board_cards SET posted_at = $2, updated_at=now() WHERE id=$1`, [c.id, undo ? null : new Date().toISOString()]);
  await log(c.id, user.id, undo ? `desmarcou como publicado` : `marcou como publicado`);
  if (!undo) await leadActivity(c.lead_id, user.id, `Publicado: ${c.title}`);
  touch(c.board_id, c.lead_id);
  revalidatePath("/");
}

export async function toggleCompleteAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  await q(`UPDATE board_cards SET completed_at = CASE WHEN completed_at IS NULL THEN now() ELSE NULL END, updated_at=now() WHERE id=$1`, [c.id]);
  await log(c.id, user.id, c.completed_at ? `reabriu o cartão` : `marcou o cartão como concluído`);
  if (!c.completed_at) await leadActivity(c.lead_id, user.id, `Entregável concluído: ${c.title}`);
  touch(c.board_id, c.lead_id);
}

export async function archiveCardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  await q(`UPDATE board_cards SET archived = NOT archived, updated_at=now() WHERE id=$1`, [c.id]);
  await log(c.id, user.id, c.archived ? `restaurou o cartão` : `arquivou o cartão`);
  touch(c.board_id, c.lead_id);
  if (!c.archived) redirect(`/quadros/${c.board_id}`);
}

export async function deleteCardAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  if (!(isManager(user) || isOwner(user) || c.created_by === user.id)) throw new Error("Só quem criou o cartão ou um gestor o pode apagar.");
  await q(`DELETE FROM board_cards WHERE id=$1`, [c.id]);
  await audit(user.id, "cartao_apagado", "card", c.id, { title: c.title, board: c.board_id });
  touch(c.board_id, c.lead_id);
  redirect(`/quadros/${c.board_id}`);
}

// ---------- Checklist e comentários ----------
export async function addChecklistItemAction(fd: FormData) {
  await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("card_id")));
  const t = txt(fd.get("text"), 300);
  if (!t) return;
  const pos = await one<any>(`SELECT coalesce(max(position),-1)+1 AS p FROM board_card_checklist WHERE card_id=$1`, [c.id]);
  await q(`INSERT INTO board_card_checklist (card_id, text, position) VALUES ($1,$2,$3)`, [c.id, t, pos.p]);
  touch(c.board_id);
}
export async function checklistItemAction(fd: FormData) {
  await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const it = id ? await one<any>(`SELECT i.*, c.board_id FROM board_card_checklist i JOIN board_cards c ON c.id = i.card_id WHERE i.id=$1`, [id]) : null;
  if (!it) return;
  if (fd.get("op") === "delete") await q(`DELETE FROM board_card_checklist WHERE id=$1`, [it.id]);
  else await q(`UPDATE board_card_checklist SET done = NOT done WHERE id=$1`, [it.id]);
  touch(it.board_id);
}

export async function addCommentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("card_id")));
  const body = txt(fd.get("body"), 4000);
  if (!body) return { error: "Escreva um comentário." };
  await q(`INSERT INTO board_card_comments (card_id, user_id, kind, body, client_visible) VALUES ($1,$2,'comentario',$3,$4)`, [c.id, user.id, body, fd.get("client_visible") === "on"]);
  touch(c.board_id);
  return { ok: "Comentário publicado." };
}

export async function deleteCommentAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const m = id ? await one<any>(`SELECT m.*, c.board_id FROM board_card_comments m JOIN board_cards c ON c.id = m.card_id WHERE m.id=$1 AND m.kind='comentario'`, [id]) : null;
  if (!m || !(m.user_id === user.id || isManager(user))) return;
  await q(`DELETE FROM board_card_comments WHERE id=$1`, [m.id]);
  touch(m.board_id);
}

// ---------- Anexos de cartões (links, capa, remover) ----------
export async function addCardLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("card_id")));
  const raw = String(fd.get("url") || "").trim().slice(0, 2000);
  let url: URL;
  try { url = new URL(raw); } catch { return { error: "Link inválido. Cole o endereço completo (começa por https://)." }; }
  if (!["https:", "http:"].includes(url.protocol)) return { error: "Só são aceites links http(s)." };
  const { CARD_CATEGORIES } = await import("../attachments");
  const category = CARD_CATEGORIES.some((x) => x.id === fd.get("category")) ? String(fd.get("category")) : "outro";
  const name = txt(fd.get("name"), 180) || url.hostname + url.pathname.slice(0, 60);
  await q(`INSERT INTO lead_attachments (card_id, category, filename, mime, size_bytes, sha256, description, uploaded_by, url, upload_status)
           VALUES ($1,$2,$3,'link',0,'',$4,$5,$6,'ready')`, [c.id, category, name, txt(fd.get("description"), 300), user.id, url.toString()]);
  await log(c.id, user.id, `adicionou o link ${name}`);
  touch(c.board_id);
  return { ok: "Link adicionado." };
}

export async function deleteCardAttachmentAction(fd: FormData) {
  const user = await requirePerm("quadros");
  const id = uuid(fd.get("id"));
  const a = id ? await one<any>(`SELECT a.id, a.card_id, a.filename, a.uploaded_by, c.board_id FROM lead_attachments a JOIN board_cards c ON c.id = a.card_id WHERE a.id=$1`, [id]) : null;
  if (!a) return;
  if (!(isManager(user) || a.uploaded_by === user.id)) throw new Error("Só quem enviou ou um gestor pode remover este anexo.");
  await q(`UPDATE board_cards SET cover_attachment_id = NULL WHERE cover_attachment_id = $1`, [a.id]);
  await q(`DELETE FROM lead_attachments WHERE id=$1`, [a.id]);
  await log(a.card_id, user.id, `removeu o anexo ${a.filename}`);
  await audit(user.id, "anexo_removido", "card", a.card_id, { attachment: a.id, name: a.filename });
  touch(a.board_id);
}

export async function setCoverAction(fd: FormData) {
  await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("card_id")));
  const att = uuid(fd.get("attachment_id"));
  const ok = att ? await one(`SELECT 1 FROM lead_attachments WHERE id=$1 AND card_id=$2 AND mime LIKE 'image/%' AND size_bytes <= 4194304`, [att, c.id]) : null;
  await q(`UPDATE board_cards SET cover_attachment_id=$2 WHERE id=$1`, [c.id, ok ? att : null]);
  touch(c.board_id);
}

export async function setCardColorAction(fd: FormData) {
  await requirePerm("quadros");
  const c = await loadCard(uuid(fd.get("id")));
  const color = String(fd.get("color") || "");
  await q(`UPDATE board_cards SET color=$2, updated_at=now() WHERE id=$1`, [c.id, tileColor(color) ? color : null]);
  touch(c.board_id);
}
