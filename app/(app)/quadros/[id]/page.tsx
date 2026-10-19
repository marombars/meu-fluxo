import Link from "next/link";
import { notFound } from "next/navigation";
import { isManager, isOwner, leadScope, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import BoardView, { type BList } from "@/components/boards/BoardView";
import CardModal from "@/components/boards/CardModal";
import BoardCalendar from "@/components/boards/BoardCalendar";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { archiveBoardAction, deleteBoardAction, updateBoardAction, updateListAction } from "@/lib/actions/boards";
import ColorPicker from "@/components/boards/ColorPicker";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ card?: string; vista?: string; mes?: string; arquivo?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const board = await one<any>(`SELECT b.*, l.name AS lead_name, l.company AS lead_company FROM boards b LEFT JOIN leads l ON l.id = b.lead_id WHERE b.id = $1`, [id]);
  if (!board) notFound();

  const [lists, cards, members, users] = await Promise.all([
    q<any>(`SELECT * FROM board_lists WHERE board_id = $1 AND NOT archived ORDER BY position, created_at`, [id]),
    q<any>(
      `SELECT c.*, l.name AS lead_name, l.company AS lead_company,
         (SELECT count(*)::int FROM lead_attachments a WHERE a.card_id = c.id AND a.upload_status = 'ready') AS attachments,
         (SELECT count(*)::int FROM board_card_comments m WHERE m.card_id = c.id AND m.kind = 'comentario') AS comments,
         (SELECT count(*)::int FROM board_card_checklist k WHERE k.card_id = c.id) AS check_total,
         (SELECT count(*)::int FROM board_card_checklist k WHERE k.card_id = c.id AND k.done) AS check_done
       FROM board_cards c LEFT JOIN leads l ON l.id = c.lead_id
       WHERE c.board_id = $1 AND NOT c.archived ORDER BY c.position, c.created_at`, [id]),
    q<any>(`SELECT m.card_id, u.id, u.name FROM board_card_members m JOIN users u ON u.id = m.user_id JOIN board_cards c ON c.id = m.card_id WHERE c.board_id = $1 ORDER BY u.name`, [id]),
    q<any>(`SELECT id, name FROM users WHERE active ORDER BY name`),
  ]);
  const view: BList[] = lists.map((l) => ({
    id: l.id, name: l.name, is_done: l.is_done, color: l.color,
    cards: cards.filter((c) => c.list_id === l.id).map((c) => ({
      id: c.id, title: c.title, list_id: c.list_id, labels: c.labels || [],
      post_at: c.post_at ? new Date(c.post_at).toISOString() : null, posted_at: c.posted_at ? new Date(c.posted_at).toISOString() : null, post_channel: c.post_channel, content_type: c.content_type, color: c.color,
      due_at: c.due_at ? new Date(c.due_at).toISOString() : null, completed_at: c.completed_at ? new Date(c.completed_at).toISOString() : null,
      cover: c.cover_attachment_id, has_desc: !!c.description, attachments: c.attachments, comments: c.comments, check_total: c.check_total, check_done: c.check_done,
      lead_name: c.lead_id && c.lead_id !== board.lead_id ? (c.lead_company || c.lead_name) : null,
      members: members.filter((m) => m.card_id === c.id).map((m) => ({ id: m.id, name: m.name })),
    })),
  }));
  const scope = leadScope(user, "l", 1);
  const leads = await q<any>(`SELECT l.id, l.name, l.company, l.stage FROM leads l WHERE ${scope.clause} ORDER BY (l.stage = 'ganho') DESC, l.name LIMIT 500`, scope.params);
  const boards = await q<any>(`SELECT id, name FROM boards WHERE NOT archived AND id <> $1 ORDER BY name`, [id]);
  const canManage = isOwner(user) || isManager(user) || board.created_by === user.id;
  const canDelete = isOwner(user) || user.role === "admin" || board.created_by === user.id;
  const calendar = sp.vista === "calendario";
  const archivedLists = sp.arquivo === "1" ? await q<any>(`SELECT * FROM board_lists WHERE board_id = $1 AND archived ORDER BY name`, [id]) : [];
  const archivedCards = sp.arquivo === "1" ? await q<any>(`SELECT c.id, c.title, l.name AS list_name FROM board_cards c JOIN board_lists l ON l.id = c.list_id WHERE c.board_id = $1 AND c.archived ORDER BY c.updated_at DESC LIMIT 100`, [id]) : [];

  return (
    <div className="full-bleed">
      <div className="no-print mb-2 text-sm"><Link href="/quadros" className="text-gray-500 hover:text-brand">← Quadros</Link></div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-9 w-2 rounded-full" style={{ background: board.color }} />
          <div>
            <h1 className="h1">{board.name}{board.archived && <span className="badge ml-2 bg-gray-100 align-middle text-gray-600">Arquivado</span>}</h1>
            {board.lead_id && <Link href={`/leads/${board.lead_id}`} className="text-sm font-semibold text-brand">Cliente: {board.lead_company || board.lead_name}</Link>}
            {board.description && <p className="text-sm text-gray-500">{board.description}</p>}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl bg-white p-1 text-sm font-semibold ring-1 ring-black/5">
            <Link href={`/quadros/${id}`} className={`rounded-lg px-3 py-1.5 ${!calendar ? "bg-brand text-white" : "text-gray-600"}`}>Quadro</Link>
            <Link href={`/quadros/${id}?vista=calendario`} className={`rounded-lg px-3 py-1.5 ${calendar ? "bg-brand text-white" : "text-gray-600"}`}>Calendário</Link>
          </div>
          <details className="relative">
            <summary className="btn-outline cursor-pointer list-none">⚙ Quadro</summary>
            <div className="absolute right-0 z-30 mt-2 w-80 space-y-3 rounded-2xl border border-black/5 bg-white p-4 shadow-2xl">
              <ActionForm action={updateBoardAction} className="space-y-2">
                <input type="hidden" name="id" value={board.id} />
                <div><label className="label">Nome</label><input name="name" defaultValue={board.name} required maxLength={120} className="input py-2" /></div>
                <div><label className="label">Descrição</label><textarea name="description" defaultValue={board.description || ""} rows={2} maxLength={1000} className="input py-2" /></div>
                <div><label className="label">Cliente</label>
                  <select name="lead_id" defaultValue={board.lead_id || ""} className="input py-2">
                    <option value="">— Quadro interno —</option>
                    {board.lead_id && !leads.some((l) => l.id === board.lead_id) && <option value={board.lead_id}>{board.lead_company || board.lead_name}</option>}
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.stage === "ganho" ? "★ " : ""}{l.company || l.name}</option>)}
                  </select>
                </div>
                <div><label className="label">Cor</label><ColorPicker name="color" value={board.color} size="sm" /></div>
                <SubmitButton className="btn-primary btn-sm w-full">Guardar</SubmitButton>
              </ActionForm>
              <Link href={`/quadros/${id}?arquivo=1`} className="block text-sm font-semibold text-brand">Ver itens arquivados</Link>
              <div className="flex flex-wrap gap-2 border-t border-black/5 pt-3">
                {canManage && <form action={archiveBoardAction}><input type="hidden" name="id" value={board.id} /><button className="btn-ghost btn-sm">{board.archived ? "Restaurar quadro" : "Arquivar quadro"}</button></form>}
                {canDelete && <form action={deleteBoardAction}><input type="hidden" name="id" value={board.id} /><ConfirmButton message={`Apagar definitivamente o quadro "${board.name}" com todos os cartões e anexos?`}>Apagar</ConfirmButton></form>}
              </div>
            </div>
          </details>
        </div>
      </div>

      {sp.arquivo === "1" && (
        <div className="card card-pad mb-4">
          <div className="flex items-center justify-between"><h2 className="font-bold text-ink">Arquivados</h2><Link href={`/quadros/${id}`} className="text-sm text-gray-500">Fechar ✕</Link></div>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Cartões</div>
              {archivedCards.length === 0 && <p className="text-sm text-gray-500">Nenhum.</p>}
              {archivedCards.map((c) => <Link key={c.id} href={`/quadros/${id}?card=${c.id}&arquivo=1`} className="block truncate py-1 text-sm text-ink hover:text-brand">{c.title} <span className="text-gray-400">· {c.list_name}</span></Link>)}
            </div>
            <div>
              <div className="label">Listas</div>
              {archivedLists.length === 0 && <p className="text-sm text-gray-500">Nenhuma.</p>}
              {archivedLists.map((l) => <form key={l.id} action={updateListAction} className="flex items-center justify-between py-1 text-sm"><span>{l.name}</span><input type="hidden" name="id" value={l.id} /><input type="hidden" name="op" value="archive" /><button className="btn-ghost btn-sm">Restaurar</button></form>)}
            </div>
          </div>
        </div>
      )}

      {calendar
        ? <BoardCalendar boardId={id} month={sp.mes} tz={user.timezone} cards={cards.filter((c) => c.post_at).map((c) => ({ id: c.id, title: c.title, post_at: new Date(c.post_at).toISOString(), posted_at: c.posted_at, post_channel: c.post_channel }))} />
        : <BoardView boardId={id} lists={view} me={user.id} users={users} />}

      {sp.card && UUID.test(sp.card) && <CardModal cardId={sp.card} boardId={id} user={user} users={users} leads={leads} boards={boards} back={`/quadros/${id}${calendar ? `?vista=calendario${sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `&mes=${sp.mes}` : ""}` : sp.arquivo === "1" ? "?arquivo=1" : ""}`} />}
    </div>
  );
}
