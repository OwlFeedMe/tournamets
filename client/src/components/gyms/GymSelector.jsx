import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Search, ShieldCheck, X } from 'lucide-react'
import api from '../../api/axios'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function GymSelector({ value, onChange, placeholder = 'Busca tu gym...' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 280)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return }
    setLoading(true)
    api.get(`/gyms?q=${encodeURIComponent(debouncedQuery)}&limit=8`)
      .then(r => setResults(r.data?.items || r.data || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const select = (gym) => {
    onChange({ gym_id: gym.id, display_name: gym.display_name, slug: gym.slug, city: gym.city, ownership_status: gym.ownership_status })
    setOpen(false)
    setQuery('')
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setResults([])
  }

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(94,234,212,0.3)', background: 'rgba(94,234,212,0.06)' }}>
        <Dumbbell size={16} color="#5eead4" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#F5F7FA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.display_name}</div>
          {value.city && <div style={{ fontSize: 12, color: '#AAB2C0' }}>{value.city}</div>}
        </div>
        <button type="button" onClick={clear} style={{ background: 'transparent', border: 'none', color: '#AAB2C0', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#AAB2C0', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ paddingLeft: 36 }}
        />
      </div>

      {open && (query.trim() || results.length > 0) && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#171B21',
          border: '1px solid #252A33',
          borderRadius: 10,
          boxShadow: '0 16px 32px rgba(0,0,0,0.32)',
          overflow: 'hidden',
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '12px 14px', color: '#AAB2C0', fontSize: 13 }}>Buscando...</div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div style={{ padding: '12px 14px', color: '#AAB2C0', fontSize: 13 }}>
              No encontramos &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map(gym => (
            <button
              key={gym.id}
              type="button"
              onMouseDown={() => select(gym)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                borderBottom: '1px solid #252A33',
                background: 'transparent',
                color: '#F5F7FA',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Dumbbell size={14} color="#5eead4" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {gym.display_name}
                  {gym.ownership_status === 'verified' && <ShieldCheck size={12} color="#5eead4" style={{ marginLeft: 5, verticalAlign: 'middle' }} />}
                </div>
                {gym.city && <div style={{ fontSize: 12, color: '#AAB2C0' }}>{gym.city}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
