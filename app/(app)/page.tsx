import { markPostedAction } from "@/lib/actions/boards";
import Link from "next/link";
import { can, requireUser, leadScope } from "@/lib/auth";
import { acceptedProposals } from "@/lib/closed";
import FinanceSummary from "@/components/FinanceSummary";
import NotesBoard from "@/components/NotesBoard";
import { one, q } from "@/lib/db";
import { STAGES } from "@/lib/constants";
import { fmtDateTime, fmtMoney, relative } from "@/lib/format";
import { ChannelBadge, LeadLink, PageHeader, StageBadge } from "@/components/ui";
import { cancelFollowupAction, completeFollowupAction, sendFollowupNowAction } from "@/lib/actions/leads";
import { getNotifications } from "@/lib/notifications";
import { SubmitButton } from "@/components/forms";
import { WhatsAppButton } from "@/components/WhatsApp";
import { SecretProvider, SecretToggle, Money } from "@/components/Secret";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ senha?: string; tab?: string; sem_acesso?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const seeFin = can(user, "financeiro"), seeMoney = can(user, "dados_cliente");
  const tab = sp.tab === "financeiro" && seeFin ? "financeiro" : "comercial";
  const firstName0 = user.name.split(" ")[0];
  const Tabs = () => seeFin ? (
    <nav className="no-print mb-6 inline-flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-black/5">
      <Link href="/" className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "comercial" ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}>Comercial</Link>
      <Link href="/?tab=financeiro" className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "financeiro" ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}>💶 Financeiro</Link>
    </nav>
  ) : null;
  if (tab === "financeiro") {
    return (
      <SecretProvider>
        <PageHeader title={`Financeiro, ${firstName0}`} subtitle="Resumo do mês — valores sem IVA." actions={<><SecretToggle />< Link href="/financeiro/lancamentos/novo" className="btn-primary">+ Novo lançamento</Link></>} />
        <Tabs />
        <FinanceSummary />
      </SecretProvider>
    );
  }
  const sc = leadScope(user, "l", 1);
  const [kpi] = await q<any>(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS novos30,
       count(*) FILTER (WHERE stage NOT IN ('ganho','perdido'))::int AS abertos,
       count(*) FILTER (WHERE stage = 'ganho')::int AS ganhos,
       count(*) FILTER (WHERE stage = 'perdido')::int AS perdidos,
       count(*) FILTER (WHERE stage = 'ganho' AND won_at > date_trunc('month', now()))::int AS ganhos_mes,
       coalesce(sum(budget) FILTER (WHERE stage NOT IN ('ganho','perdido')),0) AS pipeline_valor,
       coalesce(sum(budget) FILTER (WHERE stage = 'ganho' AND won_at > date_trunc('month', now())),0) AS ganho_valor_mes,
       count(*) FILTER (WHERE temperature='quente' AND stage NOT IN ('ganho','perdido'))::int AS quentes
     FROM leads l WHERE ${sc.clause}`, sc.params);
  const byStage = await q<{ stage: string; n: number; v: string }>(
    `SELECT stage, count(*)::int AS n, coalesce(sum(budget),0) AS v FROM leads l WHERE ${sc.clause} GROUP BY stage`, sc.params);
  const fu = await q<any>(
    `SELECT f.*, l.name AS lead_name, l.company FROM followups f JOIN leads l ON l.id = f.lead_id
     WHERE f.status='pendente' AND NOT (f.channel='email' AND f.auto_send) AND f.due_at < now() + interval '2 days' AND ${sc.clause}
     ORDER BY f.due_at LIMIT 10`, sc.params);
  const emails = await one<any>(
    `SELECT count(*) FILTER (WHERE f.status='enviado' AND f.sent_at > now() - interval '7 days')::int AS enviados7,
            count(*) FILTER (WHERE f.status='pendente' AND f.auto_send)::int AS agendados,
            count(*) FILTER (WHERE f.status='falhou')::int AS falhas
     FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.channel='email' AND ${sc.clause}`, sc.params);
  const recent = await q<any>(
    `SELECT a.*, l.name AS lead_name, u.name AS user_name FROM activities a JOIN leads l ON l.id=a.lead_id
     LEFT JOIN users u ON u.id=a.user_id WHERE ${sc.clause} ORDER BY a.created_at DESC LIMIT 8`, sc.params);
  const stale = await q<any>(
    `SELECT l.id, l.name, l.company, l.stage, l.updated_at FROM leads l
     WHERE l.stage NOT IN ('ganho','perdido') AND l.updated_at < now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id=l.id AND f.status='pendente') AND ${sc.clause}
     ORDER BY l.updated_at LIMIT 6`, sc.params);

  const notifs = await getNotifications(user);
  // valores realmente fechados = propostas aceites (plano escolhido, sem IVA); sem proposta, usa o valor estimado do lead
  const closedAll = await acceptedProposals(sc.clause.replace(/\$1/g, "$1"), sc.params);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const closedMonth = closedAll.filter((c) => c.decided_at >= monthStart);
  const won = await q<any>(`SELECT l.id, l.budget::float AS budget, l.won_at FROM leads l WHERE l.stage = 'ganho' AND ${sc.clause}`, sc.params);
  const latestByLead = new Map<string, (typeof closedAll)[number]>();
  for (const c of closedAll) if (!latestByLead.has(c.lead_id)) latestByLead.set(c.lead_id, c);
  const noPropMonth = won.filter((l) => !latestByLead.has(l.id) && l.won_at && new Date(l.won_at).toISOString() >= monthStart).reduce((a, l) => a + (l.budget || 0), 0);
  const fechadoMes = { mensal: closedMonth.reduce((a, c) => a + c.mensal, 0), unico: closedMonth.reduce((a, c) => a + c.unico, 0) + noPropMonth };
  const ganhoTotal = won.reduce((acc, l) => { const c = latestByLead.get(l.id); return c ? { m: acc.m + c.mensal, u: acc.u + c.unico } : { m: acc.m, u: acc.u + (l.budget || 0) }; }, { m: 0, u: 0 });
  const closed = kpi.ganhos + kpi.perdidos;
  const conv = closed ? Math.round((kpi.ganhos / closed) * 100) : 0;
  const max = Math.max(1, ...byStage.map((s) => s.n));
  const firstName = user.name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("pt-PT", { hour: "numeric", hour12: false, timeZone: user.timezone }).format(new Date()));
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const cards = [
    { label: "Leads em aberto", value: kpi.abertos, hint: `${kpi.novos30} novos em 30 dias`, money: false, href: "/leads" },
    { label: "Valor estimado no pipeline", value: seeMoney ? fmtMoney(kpi.pipeline_valor) : "—", hint: `${kpi.quentes} leads quentes`, money: seeMoney },
    { label: "Fechado no mês", value: seeMoney ? `${fmtMoney(fechadoMes.mensal)}/mês` : kpi.ganhos_mes, hint: seeMoney ? `${kpi.ganhos_mes} cliente(s) · ${closedMonth.length} proposta(s) aceite(s)${fechadoMes.unico ? ` · + ${fmtMoney(fechadoMes.unico)} únicos` : ""}` : `${kpi.ganhos_mes} cliente(s) ganho(s)`, money: seeMoney },
    { label: "Taxa de conversão", value: `${conv}%`, hint: `${kpi.ganhos} ganhos · ${kpi.perdidos} perdidos`, money: false },
  ];

  return (
    <SecretProvider>
      {sp.senha === "ok" && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">Senha alterada com sucesso.</div>}
      {sp.sem_acesso && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">Não tem acesso a essa área. Peça ao administrador para ativar a permissão.</div>}
      <PageHeader title={`${greet}, ${firstName}!`} subtitle="Aqui está o resumo da sua prospecção."
        actions={<>{seeMoney && <SecretToggle />}<Link href="/leads/novo" className="btn-primary">+ Novo lead</Link></>} />
      <Tabs />

      <section className={`card mb-6 overflow-hidden ${notifs.some((n) => n.overdue || n.kind === "falha") ? "border-red-200" : ""}`} id="notificacoes">
        <div className="flex items-center justify-between border-b border-black/5 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {notifs.length > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold ring-2 ring-white">{notifs.length}</span>}
            </div>
            <div>
              <h2 className="font-bold text-ink">Notificações</h2>
              <p className="text-xs text-gray-500">Ficam aqui até marcar como feito. Clique para abrir o follow-up.</p>
            </div>
          </div>
        </div>
        {notifs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Nenhuma notificação pendente. Tudo em dia! 🎯</p>
        ) : (
          <div className="divide-y divide-black/5">
            {notifs.slice(0, 8).map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/70">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.kind === "aprovacao" ? "bg-brand" : n.kind === "postagem" ? "bg-pink-500" : n.kind === "falha" ? "bg-red-500" : n.overdue ? "bg-amber-500" : "bg-gray-300"}`} />
                <Link href={n.href} className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink hover:text-brand">{n.title}</div>
                  <div className="truncate text-xs text-gray-500">{n.subtitle}</div>
                </Link>
                <div className={`text-xs ${n.overdue ? "font-semibold text-red-600" : "text-gray-500"}`} title={fmtDateTime(n.due_at, user.timezone)}>{relative(n.due_at)}</div>
                <div className="flex gap-1.5">
                  <Link href={n.href} className="btn-outline btn-sm">Abrir</Link>
                  {n.channel === "whatsapp" && n.wa_text !== null && <WhatsAppButton leadId={n.lead_id} phone={n.phone} text={n.wa_text} followupId={n.id} />}
                  {n.kind === "aprovacao" ? null : n.kind === "postagem" ? (
                    <form action={markPostedAction}><input type="hidden" name="id" value={n.id} /><SubmitButton className="btn-primary btn-sm" pendingText="…">✓ Publicado</SubmitButton></form>
                  ) : n.kind === "followup" ? (
                    <form action={completeFollowupAction}><input type="hidden" name="id" value={n.id} /><SubmitButton className="btn-primary btn-sm" pendingText="…">✓ Marcar como feito</SubmitButton></form>
                  ) : (
                    <>
                      <form action={sendFollowupNowAction}><input type="hidden" name="id" value={n.id} /><SubmitButton className="btn-lime btn-sm" pendingText="…">Reenviar</SubmitButton></form>
                      <form action={cancelFollowupAction}><input type="hidden" name="id" value={n.id} /><button className="btn-ghost btn-sm">Descartar</button></form>
                    </>
                  )}
                </div>
              </div>
            ))}
            {notifs.length > 8 && <Link href="/followups" className="block py-2.5 text-center text-xs font-semibold text-brand hover:bg-gray-50">Ver mais {notifs.length - 8} →</Link>}
          </div>
        )}
      </section>

      <NotesBoard user={user} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => {
          const inner = (
            <>
              <div className={`text-xs font-semibold uppercase tracking-wide ${i === 0 ? "text-lime" : "text-gray-500"}`}>{c.label}</div>
              <div className={`mt-2 text-3xl font-bold tracking-tight ${i === 0 ? "text-white" : "text-ink"}`}>{c.money ? <Money>{c.value}</Money> : c.value}</div>
              <div className={`mt-1 text-xs ${i === 0 ? "text-white/60" : "text-gray-500"}`}>{c.hint}</div>
            </>
          );
          return (c as any).href ? (
            <Link key={c.label} href={(c as any).href} className={`card card-pad block transition hover:shadow-md ${i === 0 ? "bg-ink text-white hover:brightness-110" : ""}`}>
              {inner}
              <span className={`no-print mt-1 inline-block text-[11px] font-semibold ${i === 0 ? "text-lime" : "text-brand"}`}>Ver leads →</span>
            </Link>
          ) : (
            <div key={c.label} className={`card card-pad ${i === 0 ? "bg-ink text-white" : ""}`}>
              {inner}
              {seeMoney && (c.label === "Fechado no mês" || c.label === "Valor estimado no pipeline") && <Link href="/valores" className="no-print mt-1 inline-block text-[11px] font-semibold text-brand">Ver de onde vem este valor →</Link>}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-ink">Funil de vendas</h2>
            <Link href="/pipeline" className="text-sm font-semibold text-brand">Abrir pipeline →</Link>
          </div>
          <div className="space-y-3">
            {STAGES.map((s) => {
              const row = byStage.find((b) => b.stage === s.id);
              const n = row?.n ?? 0;
              return (
                <Link key={s.id} href={`/leads?stage=${s.id}`} className="flex items-center gap-3 group">
                  <div className="w-24 shrink-0 text-xs text-gray-600 group-hover:text-ink sm:w-36 sm:text-sm">{s.label}</div>
                  <div className="h-7 flex-1 overflow-hidden rounded-lg bg-gray-100">
                    <div className="flex h-full items-center rounded-lg px-2 text-xs font-bold text-white" style={{ width: `${Math.max(n ? 6 : 0, (n / max) * 100)}%`, background: s.color }}>{n > 0 ? n : ""}</div>
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs text-gray-500 sm:w-28">{!seeMoney ? "" : s.id === "ganho" ? <span title="Propostas aceites (sem IVA); sem proposta usa o valor estimado"><Money>{`${fmtMoney(ganhoTotal.m)}/mês`}</Money>{ganhoTotal.u ? <span className="block text-[10px]">+ <Money>{`${fmtMoney(ganhoTotal.u)} únicos`}</Money></span> : null}</span> : <Money>{fmtMoney(row?.v ?? 0)}</Money>}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card card-pad">
          <h2 className="mb-4 font-bold text-ink">E-mails automáticos</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3"><span className="text-sm text-gray-700">Agendados</span><span className="text-xl font-bold text-brand">{emails?.agendados ?? 0}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3"><span className="text-sm text-gray-700">Enviados (7 dias)</span><span className="text-xl font-bold text-emerald-600">{emails?.enviados7 ?? 0}</span></div>
            <Link href="/followups?status=falhou" className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3"><span className="text-sm text-gray-700">Falhas</span><span className="text-xl font-bold text-red-600">{emails?.falhas ?? 0}</span></Link>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-bold text-ink">Seus próximos follow-ups</h2><Link href="/followups" className="text-sm font-semibold text-brand">Ver todos →</Link></div>
          <div className="mt-3 divide-y divide-black/5">
            {fu.length === 0 && <p className="px-5 pb-5 text-sm text-gray-500">Nada pendente para os próximos 2 dias. 🎯</p>}
            {fu.map((f) => {
              const late = new Date(f.due_at) < new Date();
              return (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${late ? "bg-red-500" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <LeadLink id={f.lead_id} name={f.lead_name} company={f.company} />
                    <div className="mt-0.5 truncate text-xs text-gray-500">{f.title || f.subject || "Follow-up"}</div>
                  </div>
                  <div className="text-right">
                    <ChannelBadge channel={f.channel} />
                    <div className={`mt-1 text-xs ${late ? "font-semibold text-red-600" : "text-gray-500"}`} title={fmtDateTime(f.due_at, user.timezone)}>{relative(f.due_at)}</div>
                  </div>
                  <form action={completeFollowupAction}><input type="hidden" name="id" value={f.id} /><button className="btn-outline btn-sm" title="Concluir">✓</button></form>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {stale.length > 0 && (
            <div className="card card-pad border-amber-200 bg-amber-50/40">
              <h2 className="font-bold text-ink">Leads esfriando</h2>
              <p className="mb-3 text-xs text-gray-500">Sem atividade há 7+ dias e sem follow-up agendado.</p>
              <div className="space-y-2">
                {stale.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <LeadLink id={l.id} name={l.name} company={l.company} />
                    <StageBadge stage={l.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card card-pad">
            <h2 className="mb-3 font-bold text-ink">Atividade recente</h2>
            <div className="space-y-3">
              {recent.length === 0 && <p className="text-sm text-gray-500">Nenhuma atividade ainda.</p>}
              {recent.map((a) => (
                <div key={a.id} className="text-sm">
                  <Link href={`/leads/${a.lead_id}`} className="font-semibold text-ink hover:text-brand">{a.lead_name}</Link>
                  <span className="text-gray-600"> — {a.content}</span>
                  <div className="text-xs text-gray-400">{a.user_name ? `${a.user_name} · ` : ""}{relative(a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SecretProvider>
  );
}
