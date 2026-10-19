import Link from "next/link";
import { one, q } from "@/lib/db";
import { isManager, isOwner, type User } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import ColorPicker from "./ColorPicker";
import { LABELS, channelName, postState, POST_STATE_CLS } from "@/lib/boards";
import { listContentTypes } from "@/lib/queries";
import ChannelChecks from "./ChannelChecks";
import ContentTypeField from "./ContentTypeField";
import { ActionForm, ConfirmButton, DateTimeField, SubmitButton } from "@/components/forms";
import Attachments from "@/components/Attachments";
import CloseOnEsc from "./CloseOnEsc";
import {
  addChecklistItemAction, addCommentAction, archiveCardAction, checklistItemAction, deleteCardAction, deleteCommentAction,
  markPostedAction, moveCardToBoardAction, setCardColorAction, setCardListAction, toggleCompleteAction, toggleLabelAction, toggleMemberAction, updateCardAction,
} from "@/lib/actions/boards";

export default async function CardModal({ cardId, boardId, user, users, leads, boards = [], back }: {
  cardId: string; boardId: string; user: User; users: { id: string; name: string }[]; leads: any[]; boards?: { id: string; name: string }[]; back: string;
}) {
  const c = await one<any>(
    `SELECT c.*, l.name AS list_name, ld.name AS lead_name, ld.company AS lead_company, u.name AS author
     FROM board_cards c JOIN board_lists l ON l.id = c.list_id LEFT JOIN leads ld ON ld.id = c.lead_id LEFT JOIN users u ON u.id = c.created_by
     WHERE c.id = $1 AND c.board_id = $2`, [cardId, boardId]);
  if (!c) return null;
  const [lists, members, checklist, comments, attachments, types] = await Promise.all([
    q<any>(`SELECT id, name FROM board_lists WHERE board_id = $1 AND NOT archived ORDER BY position`, [boardId]),
    q<any>(`SELECT user_id FROM board_card_members WHERE card_id = $1`, [cardId]),
    q<any>(`SELECT * FROM board_card_checklist WHERE card_id = $1 ORDER BY position`, [cardId]),
    q<any>(`SELECT m.*, u.name AS user_name, u.kind AS user_kind FROM board_card_comments m LEFT JOIN users u ON u.id = m.user_id WHERE m.card_id = $1 ORDER BY m.created_at DESC LIMIT 200`, [cardId]),
    q<any>(`SELECT a.id, a.category, a.filename, a.mime, a.size_bytes, a.description, a.created_at, a.uploaded_by, a.chunk_count, a.url, u.name AS uploader
            FROM lead_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.card_id = $1 AND a.upload_status = 'ready' ORDER BY a.created_at DESC`, [cardId]),
    listContentTypes(),
  ]);
  const tz = user.timezone;
  const memberIds = new Set(members.map((m) => m.user_id));
  const st = postState(c.post_at, c.posted_at);
  const done = checklist.filter((i) => i.done).length;
  const canDelete = isManager(user) || isOwner(user) || c.created_by === user.id;
  const hid = <input type="hidden" name="id" value={c.id} />;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-3 backdrop-blur-[2px] sm:p-8">
      <CloseOnEsc href={back} />
      <Link href={back} scroll={false} className="fixed inset-0 cursor-default" aria-label="Fechar" />
      <div id="cartao" role="dialog" aria-modal="true" className="relative w-full max-w-4xl rounded-2xl bg-[#f6f5fa] shadow-2xl">
        {c.cover_attachment_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/anexos/${c.cover_attachment_id}?ver=1`} alt="" className="max-h-64 w-full rounded-t-2xl bg-ink object-contain" />
        )}
        <Link href={back} scroll={false} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-gray-600 shadow hover:text-ink" aria-label="Fechar">✕</Link>

        <div className="p-5 sm:p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2 pr-10 text-xs text-gray-500">
            <span>na lista <b className="text-ink">{c.list_name}</b></span>
            {c.archived && <span className="badge bg-gray-200 text-gray-700">Arquivado</span>}
            {c.completed_at && <span className="badge bg-emerald-100 text-emerald-700">✓ Concluído</span>}
            {c.content_type && <span className="badge bg-brand-50 text-brand">{c.content_type}</span>}
            {st && <span className={`badge ${POST_STATE_CLS[st]}`}>📅 {st === "publicado" ? `Publicado ${fmtDateTime(c.posted_at, tz)}` : `${st === "atrasado" ? "Atrasado · " : ""}${fmtDateTime(c.post_at, tz)}`}{c.post_channel ? ` · ${channelName(c.post_channel)}` : ""}</span>}
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_220px]">
            <div className="min-w-0 space-y-6">
              <ActionForm action={updateCardAction} className="space-y-3">
                {hid}
                <input name="title" defaultValue={c.title} required maxLength={300} className="w-full rounded-lg bg-transparent px-1 text-xl font-bold text-ink outline-none focus:bg-white focus:ring-2 focus:ring-brand/30" />
                <div><label className="label">Descrição</label><textarea name="description" defaultValue={c.description || ""} rows={5} maxLength={10000} className="input" placeholder="Briefing, legenda, hashtags, instruções…" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="label">📅 Data e hora de postagem</label><DateTimeField name="post_at" defaultValue={c.post_at ? new Date(c.post_at).toISOString() : undefined} /></div>
                  <div><label className="label">Estilo do conteúdo</label><ContentTypeField types={types} defaultValue={c.content_type} /></div>
                  <div className="sm:col-span-2"><label className="label">Onde publicar (pode escolher várias)</label><ChannelChecks defaultValue={c.post_channel} /></div>
                  <div><label className="label">⏱ Prazo de entrega</label><DateTimeField name="due_at" defaultValue={c.due_at ? new Date(c.due_at).toISOString() : undefined} /></div>
                  <div><label className="label">Cliente (lead)</label>
                    <select name="lead_id" defaultValue={c.lead_id || ""} className="input">
                      <option value="">— Nenhum —</option>
                      {c.lead_id && !leads.some((l) => l.id === c.lead_id) && <option value={c.lead_id}>{c.lead_company || c.lead_name}</option>}
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.stage === "ganho" ? "★ " : ""}{l.company || l.name}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">Ao chegar a hora de postagem, os membros do cartão (ou quem o criou) recebem notificação no CRM, alerta no computador e e-mail — até marcarem “Publicado”. Apague a data para desligar o alerta.</p>
                <SubmitButton className="btn-primary" pendingText="A guardar…">Guardar alterações</SubmitButton>
              </ActionForm>

              <section>
                <h3 className="mb-2 flex items-center justify-between font-bold text-ink">Checklist {checklist.length > 0 && <span className="text-xs font-semibold text-gray-500">{done}/{checklist.length}</span>}</h3>
                {checklist.length > 0 && <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((done / checklist.length) * 100)}%` }} /></div>}
                <ul className="space-y-1">
                  {checklist.map((i) => (
                    <li key={i.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white">
                      <form action={checklistItemAction}><input type="hidden" name="id" value={i.id} /><button className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] ${i.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 bg-white"}`} aria-label="Alternar">{i.done ? "✓" : ""}</button></form>
                      <span className={`flex-1 text-sm ${i.done ? "text-gray-400 line-through" : "text-ink"}`}>{i.text}</span>
                      <form action={checklistItemAction} className="opacity-0 group-hover:opacity-100"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="op" value="delete" /><button className="text-xs text-red-500" aria-label="Remover">✕</button></form>
                    </li>
                  ))}
                </ul>
                <form action={addChecklistItemAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="card_id" value={c.id} />
                  <input name="text" maxLength={300} required placeholder="Adicionar item…" className="input flex-1 py-2 text-sm" />
                  <button className="btn-outline btn-sm">Adicionar</button>
                </form>
              </section>

              <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <Attachments cardId={c.id} coverId={c.cover_attachment_id} items={attachments.map((a) => ({
                  url: a.url, chunk_count: a.chunk_count, id: a.id, category: a.category, filename: a.filename, mime: a.mime, size_bytes: a.size_bytes,
                  description: a.description, created_at: new Date(a.created_at).toISOString(), uploader: a.uploader, can_delete: isManager(user) || a.uploaded_by === user.id,
                }))} />
              </section>

              <section>
                <h3 className="mb-2 font-bold text-ink">Comentários e atividade</h3>
                <ActionForm action={addCommentAction} className="space-y-2" resetOnOk>
                  <input type="hidden" name="card_id" value={c.id} />
                  <textarea name="body" rows={2} maxLength={4000} required placeholder="Escreva um comentário…" className="input text-sm" />
                  {c.lead_id && <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" name="client_visible" className="h-3.5 w-3.5 accent-[#7816ff]" />Visível para o cliente no portal (resposta ao cliente)</label>}
                  <SubmitButton className="btn-primary btn-sm" pendingText="…">Comentar</SubmitButton>
                </ActionForm>
                <ul className="mt-3 space-y-3">
                  {comments.map((m) => m.kind === "sistema" ? (
                    <li key={m.id} className="text-xs text-gray-500"><b className="text-gray-700">{m.user_name || "Sistema"}</b> {m.body} · {fmtDateTime(m.created_at, tz)}</li>
                  ) : (
                    <li key={m.id} className="flex gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{String(m.user_name || "?").slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500"><b className="text-ink">{m.user_name || "—"}</b>{m.user_kind === "cliente" ? <span className="ml-1 rounded bg-brand px-1.5 text-[10px] font-bold text-white">CLIENTE</span> : m.client_visible ? <span className="ml-1 rounded bg-brand-50 px-1.5 text-[10px] font-bold text-brand">visível ao cliente</span> : null} · {fmtDateTime(m.created_at, tz)}</div>
                        <div className="mt-0.5 whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm text-gray-800 ring-1 ring-black/5">{m.body}</div>
                        {(m.user_id === user.id || isManager(user)) && <form action={deleteCommentAction}><input type="hidden" name="id" value={m.id} /><button className="text-[11px] text-gray-400 hover:text-red-600">Apagar</button></form>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="space-y-5">
              {c.post_at && (
                <form action={markPostedAction}>
                  {hid}{c.posted_at && <input type="hidden" name="undo" value="1" />}
                  <button className={`btn w-full ${c.posted_at ? "border border-black/10 bg-white text-gray-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{c.posted_at ? "↺ Desmarcar publicado" : "✓ Marcar como publicado"}</button>
                </form>
              )}
              <form action={toggleCompleteAction}>{hid}<button className="btn-outline w-full">{c.completed_at ? "↺ Reabrir cartão" : "✓ Concluir cartão"}</button></form>

              <div>
                <div className="label">Mover para (lista)</div>
                <form action={setCardListAction} className="flex gap-1.5">
                  {hid}
                  <select name="list_id" defaultValue={c.list_id} className="input flex-1 py-2 text-sm">{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  <button className="btn-outline btn-sm">OK</button>
                </form>
              </div>

              {boards.length > 0 && (
                <div>
                  <div className="label">Mover para outro quadro</div>
                  <form action={moveCardToBoardAction} className="flex gap-1.5">
                    {hid}
                    <select name="board_id" defaultValue="" required className="input flex-1 py-2 text-sm">
                      <option value="" disabled>Escolher quadro…</option>
                      {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button className="btn-outline btn-sm">Mover</button>
                  </form>
                  <p className="mt-1 text-[11px] text-gray-400">Leva o cartão (com anexos, checklist e comentários) para o quadro escolhido e passa a ligá-lo ao cliente desse quadro.</p>
                </div>
              )}

              <div>
                <div className="label">Cor do cartão</div>
                <div className="mb-4"><ColorPicker value={c.color} action={setCardColorAction} hidden={{ id: c.id }} noneLabel="Sem cor" /></div>
                <div className="label">Etiquetas</div>
                <div className="flex flex-wrap gap-1.5">
                  {LABELS.map((l) => {
                    const on = (c.labels || []).includes(l.id);
                    return (
                      <form key={l.id} action={toggleLabelAction}>{hid}<input type="hidden" name="label" value={l.id} />
                        <button className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${on ? "text-white" : "bg-white text-gray-500 ring-1 ring-black/10"}`} style={on ? { background: l.color } : { borderLeft: `4px solid ${l.color}` }}>{on ? "✓ " : ""}{l.name}</button>
                      </form>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="label">Membros (recebem os alertas)</div>
                <div className="space-y-1">
                  {users.map((u) => {
                    const on = memberIds.has(u.id);
                    return (
                      <form key={u.id} action={toggleMemberAction}>{hid}<input type="hidden" name="user_id" value={u.id} />
                        <button className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${on ? "bg-brand-50 font-semibold text-brand" : "text-gray-600 hover:bg-white"}`}>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${on ? "bg-brand text-white" : "bg-gray-200 text-gray-600"}`}>{u.name.slice(0, 1).toUpperCase()}</span>
                          <span className="flex-1 truncate">{u.name}</span>{on && "✓"}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </div>

              {c.lead_id && <Link href={`/leads/${c.lead_id}`} className="block text-sm font-semibold text-brand">Abrir ficha do cliente →</Link>}

              <div className="space-y-2 border-t border-black/5 pt-4">
                <form action={archiveCardAction}>{hid}<button className="btn-ghost btn-sm w-full">{c.archived ? "Restaurar cartão" : "Arquivar cartão"}</button></form>
                {canDelete && <form action={deleteCardAction}>{hid}<ConfirmButton className="btn-ghost btn-sm w-full text-red-600" message={`Apagar definitivamente o cartão "${c.title}" e os seus anexos?`}>Apagar cartão</ConfirmButton></form>}
                <p className="text-[11px] text-gray-400">Criado por {c.author || "—"} · {fmtDateTime(c.created_at, tz)}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
