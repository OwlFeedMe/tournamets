import { Check, ChevronRight, Dumbbell, GitMerge, MapPin, ScrollText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const SUBMISSION_STATUS_COLORS = {
  pending: '#cdaa6b',
  approved: '#22c55e',
  rejected: '#ef4444',
  matched: '#5eead4',
}

const CLAIM_STATUS_COLORS = {
  pending: '#cdaa6b',
  approved: '#22c55e',
  rejected: '#ef4444',
  withdrawn: '#8b94a3',
}

const REPORT_CATEGORY_LABELS = {
  wrong_info: 'Info incorrecta',
  closed: 'Cerrado',
  duplicate: 'Duplicado',
  other: 'Otro',
}

const GYM_STATUS_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['published', 'rejected'],
  published: ['suspended', 'archived'],
  suspended: ['published', 'archived'],
  rejected: ['pending_review'],
  archived: [],
}

const GYM_STATUS_LABELS = {
  draft: 'Borrador',
  pending_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  archived: 'Archivado',
  suspended: 'Suspendido',
}

function SectionHeader({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--oa-text)', margin: 0 }}>{title}</h2>
      {count > 0 && (
        <span style={{
          background: '#cdaa6b22', color: '#cdaa6b',
          border: '1px solid #cdaa6b44', borderRadius: 999,
          fontSize: 11, fontWeight: 800, padding: '2px 8px',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

function FilterPills({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          style={{
            padding: '5px 12px', borderRadius: 999,
            border: value === key ? '1px solid var(--oa-accent)' : '1px solid var(--oa-border)',
            background: value === key ? 'rgba(94,234,212,0.1)' : 'transparent',
            color: value === key ? 'var(--oa-accent)' : 'var(--oa-text-muted)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Submissions section ────────────────────────────────────────────────────────

function SubmissionsSection() {
  const [submissions, setSubmissions] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [approveForm, setApproveForm] = useState({})

  const load = async (s) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/admin/gym-submissions?status=${s}`)
      setSubmissions(data)
    } catch {
      setSubmissions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [filter])

  const approve = async (sub) => {
    const displayName = approveForm[sub.id] || sub.proposed_name
    setActing(sub.id)
    try {
      await api.post(`/admin/gym-submissions/${sub.id}/approve`, { display_name: displayName })
      load(filter)
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  const reject = async (subId) => {
    setActing(subId)
    try {
      await api.post(`/admin/gym-submissions/${subId}/reject`)
      load(filter)
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  const pendingCount = filter === 'pending' ? submissions.length : 0

  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeader title="Sugerencias de gyms" count={pendingCount} />
      <FilterPills
        options={[
          { key: 'pending', label: 'Pendientes' },
          { key: 'approved', label: 'Aprobadas' },
          { key: 'rejected', label: 'Rechazadas' },
          { key: 'all', label: 'Todas' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : submissions.length === 0 ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin sugerencias en este estado</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {submissions.map((sub) => {
            const statusColor = SUBMISSION_STATUS_COLORS[sub.status] || '#8b94a3'
            return (
              <div key={sub.id} style={{ background: '#171a20', border: '1px solid var(--oa-border)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--oa-text)' }}>{sub.proposed_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, padding: '1px 7px', borderRadius: 999, border: `1px solid ${statusColor}33`, background: `${statusColor}11` }}>
                        {sub.status}
                      </span>
                    </div>
                    {(sub.city || sub.country) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--oa-text-muted)', fontSize: 12 }}>
                        <MapPin size={11} />{[sub.city, sub.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {sub.instagram_url && <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 2 }}>IG: {sub.instagram_url}</div>}
                    {sub.notes && <div style={{ fontSize: 12, color: 'var(--oa-text-muted)', marginTop: 6, fontStyle: 'italic' }}>"{sub.notes}"</div>}
                    <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 6 }}>Usuario #{sub.submitted_by_user_id} · {sub.submission_type}</div>
                  </div>
                </div>
                {sub.status === 'pending' && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      value={approveForm[sub.id] ?? sub.proposed_name}
                      onChange={(e) => setApproveForm((p) => ({ ...p, [sub.id]: e.target.value }))}
                      placeholder="Nombre final del gym"
                      style={{ width: '100%', background: '#0d0f12', border: '1px solid var(--oa-border)', borderRadius: 8, padding: '8px 10px', color: 'var(--oa-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => approve(sub)} disabled={acting === sub.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        <Check size={14} /> Aprobar y crear gym
                      </button>
                      <button type="button" onClick={() => reject(sub.id)} disabled={acting === sub.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        <X size={14} /> Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Claims section ─────────────────────────────────────────────────────────────

function ClaimsSection() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = async (s) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/admin/gym-claims?status=${s}`)
      setClaims(data)
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [filter])

  const approve = async (claimId) => {
    setActing(claimId)
    try { await api.post(`/admin/gym-claims/${claimId}/approve`); load(filter) }
    catch { /* silent */ } finally { setActing(null) }
  }

  const reject = async (claimId) => {
    setActing(claimId)
    try { await api.post(`/admin/gym-claims/${claimId}/reject`); load(filter) }
    catch { /* silent */ } finally { setActing(null) }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeader title="Claims de ownership" count={filter === 'pending' ? claims.length : 0} />
      <FilterPills
        options={[
          { key: 'pending', label: 'Pendientes' },
          { key: 'approved', label: 'Aprobados' },
          { key: 'rejected', label: 'Rechazados' },
          { key: 'all', label: 'Todos' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : claims.length === 0 ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin claims en este estado</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {claims.map((claim) => {
            const statusColor = CLAIM_STATUS_COLORS[claim.status] || '#8b94a3'
            return (
              <div key={claim.id} style={{ background: '#171a20', border: '1px solid var(--oa-border)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)' }}>
                        {claim.gym_display_name || `Gym #${claim.gym_id}`}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, padding: '1px 7px', borderRadius: 999, border: `1px solid ${statusColor}33`, background: `${statusColor}11` }}>{claim.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--oa-text-muted)', marginBottom: 4 }}>
                      {claim.requester_display_name || `Usuario #${claim.requested_by_user_id}`} - Rol: {claim.role_requested}
                    </div>
                    {claim.requester_email && (
                      <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>
                        {claim.requester_email}
                      </div>
                    )}
                    {claim.evidence_type && (
                      <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)' }}>
                        Evidencia: {claim.evidence_type}
                        {claim.evidence_url && <a href={claim.evidence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--oa-accent)', marginLeft: 8, textDecoration: 'none' }}>Ver link</a>}
                      </div>
                    )}
                    {claim.notes && <div style={{ fontSize: 12, color: 'var(--oa-text-muted)', marginTop: 6, fontStyle: 'italic' }}>"{claim.notes}"</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => claim.gym_slug && navigate(`/gyms/${claim.gym_slug}`)}
                    disabled={!claim.gym_slug}
                    style={{ background: 'none', border: 'none', cursor: claim.gym_slug ? 'pointer' : 'default', color: 'var(--oa-text-muted)', display: 'flex', padding: 4 }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {claim.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" onClick={() => approve(claim.id)} disabled={acting === claim.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <Check size={14} /> Aprobar
                    </button>
                    <button type="button" onClick={() => reject(claim.id)} disabled={acting === claim.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <X size={14} /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Gyms list + merge section ──────────────────────────────────────────────────

function MergeModal({ sourceGym, onClose, onMerged }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/admin/gyms?status=all&q=${encodeURIComponent(query)}&limit=8`)
        setResults((data?.items || []).filter(g => g.id !== sourceGym.id))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 280)
  }, [query, sourceGym.id])

  const doMerge = async () => {
    if (!target) return
    setBusy(true)
    setMsg(null)
    try {
      await api.post(`/admin/gyms/${sourceGym.id}/merge-into/${target.id}`)
      setMsg({ type: 'success', text: `Merge completado. "${sourceGym.display_name}" fue archivado.` })
      setTimeout(() => { onClose(); onMerged() }, 1800)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error al hacer merge' })
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 12px' }}>
      <div style={{ width: '100%', maxWidth: 480, borderRadius: 20, background: '#171B21', border: '1px solid #252A33', padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#F5F7FA', display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitMerge size={16} color="#cdaa6b" /> Merge gym
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#AAB2C0', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>GYM ORIGEN (será archivado)</div>
          <div style={{ fontWeight: 700, color: '#F5F7FA' }}>{sourceGym.display_name}</div>
          {sourceGym.city && <div style={{ fontSize: 12, color: '#AAB2C0' }}>{sourceGym.city}</div>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#AAB2C0', display: 'block', marginBottom: 6 }}>Gym destino (queda activo y recibe todos los datos)</label>
          <input
            value={target ? target.display_name : query}
            onChange={e => { if (target) setTarget(null); setQuery(e.target.value) }}
            placeholder="Busca el gym destino..."
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          {!target && results.length > 0 && (
            <div style={{ background: '#0D0F12', border: '1px solid #252A33', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
              {loading && <div style={{ padding: '10px 12px', color: '#AAB2C0', fontSize: 13 }}>Buscando...</div>}
              {results.map(g => (
                <button key={g.id} type="button" onMouseDown={() => { setTarget(g); setQuery('') }} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #252A33', background: 'transparent', color: '#F5F7FA', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{g.display_name}</span>
                  {g.city && <span style={{ color: '#AAB2C0', marginLeft: 6 }}>{g.city}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {target && (
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.06)', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 4 }}>GYM DESTINO (quedará activo)</div>
            <div style={{ fontWeight: 700, color: '#F5F7FA' }}>{target.display_name}</div>
            {target.city && <div style={{ fontSize: 12, color: '#AAB2C0' }}>{target.city}</div>}
          </div>
        )}

        {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 12, fontSize: 13 }}>{msg.text}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancelar</button>
          <button
            type="button"
            onClick={doMerge}
            disabled={!target || busy}
            style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: target ? 'rgba(205,170,107,0.18)' : 'rgba(255,255,255,0.06)', color: target ? '#cdaa6b' : '#8b94a3', fontWeight: 700, fontSize: 13, cursor: target ? 'pointer' : 'default' }}
          >
            {busy ? 'Procesando...' : 'Confirmar merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GymsListSection() {
  const navigate = useNavigate()
  const [gyms, setGyms] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [acting, setActing] = useState(null)
  const [mergeTarget, setMergeTarget] = useState(null)

  const load = async (s) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200', offset: '0', status: s })
      const gymRes = await api.get(`/admin/gyms?${params}`)
      setGyms(gymRes.data.items || [])
    } catch {
      setGyms([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(statusFilter) }, [statusFilter])

  const changeStatus = async (gymId, newStatus) => {
    setActing(gymId)
    try {
      await api.post(`/admin/gyms/${gymId}/status`, { status: newStatus })
      load(statusFilter)
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      {mergeTarget && (
        <MergeModal
          sourceGym={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onMerged={() => { setMergeTarget(null); load(statusFilter) }}
        />
      )}

      <SectionHeader title="Gyms" />
      <FilterPills
        options={[
          { key: 'pending_review', label: 'En revisión' },
          { key: 'published', label: 'Publicados' },
          { key: 'suspended', label: 'Suspendidos' },
          { key: 'rejected', label: 'Rechazados' },
          { key: 'archived', label: 'Archivados' },
          { key: 'all', label: 'Todos' },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : gyms.length === 0 ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No hay gyms en este estado</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gyms.map((gym) => {
            const transitions = GYM_STATUS_TRANSITIONS[gym.status] || []
            return (
              <div key={gym.id} style={{ background: '#171a20', border: '1px solid var(--oa-border)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: gym.logo_url ? `url(${gym.logo_url}) center/cover no-repeat` : '#252b35', display: 'grid', placeItems: 'center' }}>
                  {!gym.logo_url && <Dumbbell size={16} color="var(--oa-text-muted)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gym.display_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>{[gym.city, gym.country].filter(Boolean).join(', ')} · {GYM_STATUS_LABELS[gym.status] || gym.status}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => navigate(`/gyms/${gym.slug}`)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Ver
                  </button>
                  <button type="button" onClick={() => setMergeTarget(gym)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(205,170,107,0.3)', background: 'rgba(205,170,107,0.08)', color: '#cdaa6b', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <GitMerge size={11} /> Merge
                  </button>
                  {transitions.map((t) => (
                    <button key={t} type="button" onClick={() => changeStatus(gym.id, t)} disabled={acting === gym.id} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: t === 'published' ? 'rgba(34,197,94,0.15)' : t === 'suspended' ? 'rgba(205,170,107,0.15)' : 'rgba(239,68,68,0.1)', color: t === 'published' ? '#22c55e' : t === 'suspended' ? '#cdaa6b' : '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {GYM_STATUS_LABELS[t] || t}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Reports section ────────────────────────────────────────────────────────────

function ReportsSection() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = async (s) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/admin/gym-reports?status=${s}`)
      setReports(data)
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [filter])

  const resolve = async (reportId, resolution) => {
    setActing(reportId)
    try {
      await api.post(`/admin/gym-reports/${reportId}/resolve`, { resolution })
      load(filter)
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeader title="Reportes de usuarios" count={filter === 'pending' ? reports.length : 0} />
      <FilterPills
        options={[
          { key: 'pending', label: 'Pendientes' },
          { key: 'resolved', label: 'Resueltos' },
          { key: 'dismissed', label: 'Descartados' },
          { key: 'all', label: 'Todos' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : reports.length === 0 ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin reportes en este estado</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map((r) => (
            <div key={r.id} style={{ background: '#171a20', border: '1px solid var(--oa-border)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--oa-text)' }}>{r.gym_display_name || `Gym #${r.gym_id}`}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#cdaa6b', padding: '1px 7px', borderRadius: 999, border: '1px solid #cdaa6b33', background: '#cdaa6b11' }}>
                      {REPORT_CATEGORY_LABELS[r.category] || r.category}
                    </span>
                    <span style={{ fontSize: 10, color: r.status === 'pending' ? '#cdaa6b' : r.status === 'resolved' ? '#22c55e' : '#8b94a3', fontWeight: 600 }}>
                      {r.status}
                    </span>
                  </div>
                  {r.details && <div style={{ fontSize: 13, color: 'var(--oa-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>"{r.details}"</div>}
                  <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 6 }}>
                    Usuario #{r.reported_by_user_id} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <button type="button" onClick={() => r.gym_slug && navigate(`/gyms/${r.gym_slug}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--oa-text-muted)', display: 'flex', padding: 4, flexShrink: 0 }}>
                  <ChevronRight size={16} />
                </button>
              </div>
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => resolve(r.id, 'resolved')} disabled={acting === r.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Check size={14} /> Resolver
                  </button>
                  <button type="button" onClick={() => resolve(r.id, 'dismissed')} disabled={acting === r.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: 'rgba(139,148,163,0.1)', color: '#8b94a3', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <X size={14} /> Descartar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Bitácora / Audit log section ───────────────────────────────────────────────

function BitacoraSection() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [gymName, setGymName] = useState('')
  const [actionType, setActionType] = useState('')
  const debounceRef = useRef(null)

  const load = async (name, action) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (name) params.set('gym_name', name)
      if (action) params.set('action_type', action)
      const { data } = await api.get(`/admin/gym-audit-log?${params}`)
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(gymName, actionType), 300)
  }, [gymName, actionType])

  const ACTION_COLORS = {
    merge: '#cdaa6b',
    status_change: '#5eead4',
    claim_approved: '#22c55e',
    claim_rejected: '#ef4444',
    membership_approved: '#22c55e',
    membership_removed: '#ef4444',
    edit: '#8b94a3',
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <ScrollText size={16} color="var(--oa-accent)" />
        <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--oa-text)', margin: 0 }}>Bitácora de operaciones</h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={gymName}
          onChange={e => setGymName(e.target.value)}
          placeholder="Filtrar por gym..."
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={actionType} onChange={e => setActionType(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Todas las acciones</option>
          <option value="status_change">Cambio de estado</option>
          <option value="claim_approved">Claim aprobado</option>
          <option value="claim_rejected">Claim rechazado</option>
          <option value="membership_approved">Membresía aprobada</option>
          <option value="membership_removed">Membresía eliminada</option>
          <option value="merge">Merge</option>
          <option value="edit">Edición</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin entradas en el log</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((e) => {
            const actionColor = ACTION_COLORS[e.action_type] || '#8b94a3'
            return (
              <div key={e.id} style={{ background: '#171a20', border: '1px solid var(--oa-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: actionColor, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.gym_display_name || `Gym #${e.gym_id}`}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: actionColor, padding: '1px 7px', borderRadius: 999, border: `1px solid ${actionColor}33`, background: `${actionColor}11`, flexShrink: 0 }}>
                      {e.action_type}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--oa-text-muted)' }}>
                    {e.actor_name || (e.actor_user_id ? `Usuario #${e.actor_user_id}` : 'Sistema')}
                    {' · '}
                    {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                  </div>
                  {e.after_snapshot && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#8b94a3', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '4px 8px', overflowX: 'auto', maxWidth: '100%' }}>
                      {e.after_snapshot}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const SECTIONS = ['Sugerencias', 'Claims', 'Gyms', 'Reportes', 'Bitácora']

export default function AdminGymsPanel() {
  const [activeSection, setActiveSection] = useState(0)

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f12', paddingBottom: 120 }}>
      <div style={{ padding: '32px 20px 0', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Dumbbell size={22} color="var(--oa-accent)" />
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--oa-text)', margin: 0, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 1 }}>
            Admin · Gyms
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 28, borderBottom: '1px solid var(--oa-border)', paddingBottom: 16, overflowX: 'auto' }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(i)}
              style={{
                padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap',
                border: activeSection === i ? '1px solid rgba(214,217,224,0.28)' : '1px solid transparent',
                background: activeSection === i ? 'linear-gradient(135deg,rgba(214,217,224,0.14),rgba(94,234,212,0.10))' : 'transparent',
                color: activeSection === i ? 'var(--oa-text)' : 'var(--oa-text-secondary)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {activeSection === 0 && <SubmissionsSection />}
        {activeSection === 1 && <ClaimsSection />}
        {activeSection === 2 && <GymsListSection />}
        {activeSection === 3 && <ReportsSection />}
        {activeSection === 4 && <BitacoraSection />}
      </div>
    </div>
  )
}
