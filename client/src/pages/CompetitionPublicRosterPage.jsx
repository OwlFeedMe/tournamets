import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MapPin, Users, Search, X, LayoutGrid, List, ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { hexToRgba, resolveCompetitionTheme } from '../utils/competitionTheme'
import { loadCountries, parseCityCountry } from '../utils/locations'

const INITIAL_VISIBLE_COUNT = 12

function buildPageBackground(theme) {
  return `#0D0F12`
}

function buildCategoryKey(modality, category) {
  return `${modality}-${category?.category_id || category?.category_name}`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'FR'
}

function getDisplayName(item) {
  if (item.type === 'team') return item.teamName || 'Equipo'
  return [item.nombre, item.apellido].filter(Boolean).join(' ').trim() || 'Participante'
}

function buildCategoryTone(label, theme) {
  const key = normalizeText(label)
  if (key.includes('elite f')) {
    return { glow: 'rgba(255,80,160,0.18)', text: '#F48FB1', pillBg: 'rgba(255,80,160,0.10)', pillBorder: 'rgba(255,80,160,0.28)' }
  }
  if (key.includes('elite m') || key.includes('rx')) {
    return { glow: 'rgba(0,194,255,0.18)', text: '#67D3FF', pillBg: 'rgba(0,194,255,0.10)', pillBorder: 'rgba(0,194,255,0.28)' }
  }
  if (key.includes('masters 35')) {
    return { glow: 'rgba(0,229,201,0.18)', text: '#00E5C9', pillBg: 'rgba(0,229,201,0.10)', pillBorder: 'rgba(0,229,201,0.28)' }
  }
  if (key.includes('masters 40')) {
    return { glow: 'rgba(130,80,255,0.18)', text: '#A58BFF', pillBg: 'rgba(130,80,255,0.10)', pillBorder: 'rgba(130,80,255,0.28)' }
  }
  if (key.includes('masters 45')) {
    return { glow: 'rgba(255,190,40,0.18)', text: '#F7C84B', pillBg: 'rgba(255,190,40,0.10)', pillBorder: 'rgba(255,190,40,0.28)' }
  }
  if (key.includes('masters 50')) {
    return { glow: 'rgba(255,106,0,0.18)', text: '#FF9A3D', pillBg: 'rgba(255,106,0,0.10)', pillBorder: 'rgba(255,106,0,0.28)' }
  }
  return { glow: hexToRgba(theme.accent || '#00C2A8', 0.18), text: theme.accent || '#00C2A8', pillBg: hexToRgba(theme.accent || '#00C2A8', 0.12), pillBorder: hexToRgba(theme.accent || '#00C2A8', 0.24) }
}

function buildPhotoGradient(index) {
  const tones = [
    ['#120912', '#05070B'],
    ['#180608', '#08090D'],
    ['#0A1018', '#05070B'],
    ['#171005', '#08090D'],
    ['#120812', '#04060A'],
  ]
  const pair = tones[index % tones.length]
  return `linear-gradient(180deg, ${pair[0]} 0%, ${pair[1]} 100%)`
}

function getCountryInfo(locationValue, countryCodeByName) {
  const parsed = parseCityCountry(locationValue || '')
  const countryCode = countryCodeByName[(parsed.countryName || '').toLowerCase()] || ''
  return {
    parsed,
    countryCode,
    flagUrl: countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : '',
  }
}

function buildRosterItems(sections) {
  const items = []
  sections.forEach((section) => {
    const categoryLabel = section.category_name
    if (section.modality === 'teams') {
      ;(section.teams || []).forEach((team, teamIndex) => {
        const members = Array.isArray(team.members) ? team.members : []
        const representative = members[0] || {}
        items.push({
          type: 'team',
          id: `team-${team.id || `${section.key}-${teamIndex}`}`,
          categoryKey: section.key,
          categoryName: categoryLabel,
          modality: 'teams',
          teamName: team.nombre || 'Equipo',
          members,
          nombre: team.nombre || 'Equipo',
          apellido: '',
          box: representative?.box || '',
          ciudad_pais: representative?.ciudad_pais || '',
          profile_photo_url: '',
          searchText: normalizeText([
            team.nombre,
            ...members.map((member) => [member?.nombre, member?.apellido, member?.ciudad_pais, member?.box].filter(Boolean).join(' ')),
          ].join(' ')),
        })
      })
      return
    }
    ;(section.participants || []).forEach((participant, participantIndex) => {
      items.push({
        ...participant,
        type: 'participant',
        id: participant.id || `participant-${section.key}-${participantIndex}`,
        categoryKey: section.key,
        categoryName: categoryLabel,
        modality: 'individual',
        searchText: normalizeText([
          participant?.nombre,
          participant?.apellido,
          participant?.ciudad_pais,
          participant?.box,
        ].filter(Boolean).join(' ')),
      })
    })
  })
  return items
}

function CatDropdown({ activeCat, setActiveCat, options, allCount, theme }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const optionsWithAll = useMemo(
    () => [{ key: 'all', label: 'Todos', count: allCount }, ...options],
    [allCount, options],
  )

  const activeOption = optionsWithAll.find((option) => option.key === activeCat) || optionsWithAll[0]
  const activeTone = buildCategoryTone(activeOption?.label || 'Todos', theme)
  const activeColor = activeTone.text || (theme.accent || '#00C2A8')

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', minWidth: 220 }}>
      <style>{`
        @keyframes dropIn {
          0% { opacity: 0; transform: translateY(-6px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: activeColor,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid #252A33',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeColor, flexShrink: 0 }} />
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', flex: 1 }}>
          {activeCat === 'all' ? 'Todas las categorias' : activeOption?.label || 'Categoria'}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            background: 'rgba(255,255,255,0.06)',
            color: '#6B7280',
            borderRadius: 8,
            padding: '1px 7px',
            flexShrink: 0,
          }}
        >
          {activeCat === 'all' ? allCount : (activeOption?.count || 0)}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: '100%',
            background: '#171B21',
            border: '1px solid #252A33',
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 200,
            boxShadow: '0 24px 48px rgba(0,0,0,0.7)',
            animation: 'dropIn 0.18s ease',
          }}
        >
          {optionsWithAll.map((option, index, array) => {
            const tone = buildCategoryTone(option.label, theme)
            const color = tone.text || (theme.accent || '#00C2A8')
            const isActive = activeCat === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setActiveCat(option.key)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '11px 16px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: isActive ? color : '#AAB2C0',
                  background: isActive ? hexToRgba(color, 0.08) : 'transparent',
                  border: 'none',
                  borderBottom: index < array.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  textAlign: 'left',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(event) => {
                  if (isActive) return
                  event.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  event.currentTarget.style.color = '#F5F7FA'
                }}
                onMouseLeave={(event) => {
                  if (isActive) return
                  event.currentTarget.style.background = 'transparent'
                  event.currentTarget.style.color = '#AAB2C0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: isActive ? 1 : 0.45, flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.key === 'all' ? 'Todas las categorias' : option.label}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    background: isActive ? hexToRgba(color, 0.12) : 'rgba(255,255,255,0.06)',
                    color: isActive ? color : '#6B7280',
                    borderRadius: 8,
                    padding: '1px 7px',
                    marginLeft: 8,
                    flexShrink: 0,
                  }}
                >
                  {option.count}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function AthleteCard({ item, itemIndex, tone, flagUrl, onOpen, compact = false }) {
  const displayName = getDisplayName(item)
  const subtitle = item.type === 'team'
    ? `${item.members?.length || 0} integrante${(item.members?.length || 0) === 1 ? '' : 's'}`
    : item.box || item.ciudad_pais || 'Sin box confirmado'
  const [isVisible, setIsVisible] = useState(false)
  const animationDelay = `${Math.min(itemIndex, 11) * 55}ms`
  const revealTransition = isVisible
    ? 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease'
    : 'opacity 0.36s ease, transform 0.36s ease, border-color 0.18s ease, box-shadow 0.18s ease'

  useEffect(() => {
    setIsVisible(false)
    const timer = window.setTimeout(() => setIsVisible(true), 16)
    return () => window.clearTimeout(timer)
  }, [item.id, itemIndex])

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#0F1118',
        border: '1px solid #252A33',
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        color: '#F5F7FA',
        padding: 0,
        boxShadow: `0 0 0 1px transparent, 0 10px 28px rgba(0,0,0,0.24)`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(18px)',
        transition: revealTransition,
        transitionDelay: isVisible ? '0ms' : animationDelay,
        willChange: 'opacity, transform',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-4px)'
        event.currentTarget.style.borderColor = hexToRgba(tone.text, 0.35)
        event.currentTarget.style.boxShadow = `0 18px 44px rgba(0,0,0,0.44), 0 0 24px ${tone.glow}`
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)'
        event.currentTarget.style.borderColor = '#252A33'
        event.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.24)'
      }}
    >
      <div style={{ width: '100%', aspectRatio: compact ? '1 / 1.28' : '3 / 3.5', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: buildPhotoGradient(itemIndex) }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: compact ? 44 : 64, height: compact ? 44 : 64, background: `linear-gradient(225deg, ${hexToRgba(tone.text, 0.18)} 0%, transparent 65%)` }} />
        <div style={{ position: 'absolute', top: compact ? 8 : 10, left: compact ? 8 : 10, zIndex: 2, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: compact ? '2px 6px' : '3px 7px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: compact ? 9 : 10, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.52)' }}>
          #{String(itemIndex + 1).padStart(3, '0')}
        </div>
        {flagUrl ? (
          <img
            src={flagUrl}
            alt={item.ciudad_pais || 'Pais'}
            style={{ position: 'absolute', top: compact ? 10 : 12, right: compact ? 10 : 12, width: compact ? 24 : 30, height: compact ? 17 : 21, borderRadius: 2, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)', zIndex: 2 }}
          />
        ) : null}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(8,9,13,0.94) 0%, transparent 55%)', opacity: 0.5 }} />
        <div style={{ position: 'relative', zIndex: 1, fontFamily: '"Bebas Neue", sans-serif', fontSize: compact ? 54 : 78, letterSpacing: '0.02em', opacity: 0.24, color: tone.text, textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
          {getInitials(displayName)}
        </div>
      </div>
      <div style={{ padding: compact ? '11px 11px 12px' : '14px 14px 16px' }}>
        <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: compact ? 20 : 26, lineHeight: 1.02, letterSpacing: '0.04em', marginBottom: compact ? 6 : 8, overflowWrap: 'anywhere' }}>
          {displayName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 6, flexWrap: 'wrap' }}>
          <div style={{ width: compact ? 5 : 6, height: compact ? 5 : 6, borderRadius: 999, background: tone.text, flexShrink: 0 }} />
          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: compact ? 10 : 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: compact ? 92 : 140 }}>
            {subtitle}
          </div>
          <div style={{ width: 1, height: compact ? 8 : 10, background: '#252A33' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', padding: compact ? '2px 6px' : '3px 8px', borderRadius: 4, border: `1px solid ${tone.pillBorder}`, background: tone.pillBg, color: tone.text, fontFamily: '"Barlow Condensed", sans-serif', fontSize: compact ? 9 : 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', maxWidth: compact ? '100%' : undefined, overflowWrap: compact ? 'anywhere' : undefined }}>
            {item.categoryName}
          </div>
        </div>
      </div>
    </button>
  )
}

function AthleteListRow({ item, tone, flagUrl, onOpen }) {
  const displayName = getDisplayName(item)
  const subtitle = item.type === 'team'
    ? `${item.members?.length || 0} integrante${(item.members?.length || 0) === 1 ? '' : 's'}`
    : item.box || item.ciudad_pais || 'Sin box confirmado'

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '13px 14px',
        borderRadius: 12,
        border: '1px solid #252A33',
        background: 'rgba(15,17,24,0.96)',
        color: '#F5F7FA',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: buildPhotoGradient(0),
          border: `1px solid ${hexToRgba(tone.text, 0.18)}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone.text,
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 24,
          flexShrink: 0,
        }}>
          {getInitials(displayName)}
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
          <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, lineHeight: 1, letterSpacing: '0.03em', color: '#F5F7FA', overflowWrap: 'anywhere' }}>
            {displayName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            {flagUrl ? <img src={flagUrl} alt={item.ciudad_pais || 'Pais'} style={{ width: 18, height: 13, borderRadius: 2, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }} /> : null}
            <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280', overflowWrap: 'anywhere' }}>
              {subtitle}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 8, flexShrink: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 999, border: `1px solid ${tone.pillBorder}`, background: tone.pillBg, color: tone.text, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', maxWidth: 120, overflowWrap: 'anywhere' }}>
          {item.categoryName}
        </span>
        <ChevronRight size={16} color="#6B7280" />
      </div>
    </button>
  )
}

function AthleteModal({ item, onClose, tone, countryCodeByName }) {
  if (!item) return null
  const displayName = getDisplayName(item)
  const info = getCountryInfo(item.ciudad_pais, countryCodeByName)
  const fields = item.type === 'team'
    ? [
        ['Categoria', item.categoryName],
        ['Modalidad', 'Equipos'],
        ['Integrantes', String(item.members?.length || 0)],
        ['Box', item.box || '-'],
      ]
    : [
        ['Categoria', item.categoryName],
        ['Modalidad', 'Individual'],
        ['Ciudad / Pais', item.ciudad_pais || '-'],
        ['Box', item.box || '-'],
      ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.84)',
        backdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="fr-cut-card"
        style={{
          width: 'min(460px, 100%)',
          maxHeight: 'min(88vh, 760px)',
          overflow: 'auto',
          background: '#0F1118',
          border: `1px solid ${hexToRgba(tone.text, 0.24)}`,
          boxShadow: `0 40px 80px rgba(0,0,0,0.8), 0 0 60px ${tone.glow}`,
        }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', padding: 12, background: 'linear-gradient(180deg, rgba(15,17,24,0.94) 0%, rgba(15,17,24,0.66) 100%)', backdropFilter: 'blur(8px)' }}>
          <button type="button" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', color: '#F5F7FA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ marginTop: -62 }}>
          <div style={{ height: 220, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: buildPhotoGradient(0) }}>
            <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 120, opacity: 0.18, color: tone.text }}>
              {getInitials(displayName)}
            </div>
            {info.flagUrl ? (
              <img src={`https://flagcdn.com/w80/${info.countryCode}.png`} alt={info.parsed.countryName || info.countryCode.toUpperCase()} style={{ position: 'absolute', bottom: 14, left: 16, width: 52, height: 36, borderRadius: 3, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }} />
            ) : null}
          </div>
          <div style={{ padding: '20px 24px 28px', display: 'grid', gap: 18 }}>
            <div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 40, lineHeight: 1, letterSpacing: '0.03em', color: '#F5F7FA' }}>{displayName}</div>
              <div style={{ marginTop: 4, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tone.text }}>
                {item.type === 'team' ? (item.box || 'Equipo confirmado') : (item.box || 'Sin box confirmado')}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {fields.map(([label, value]) => (
                <div key={label} style={{ borderRadius: 8, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', padding: '10px 12px' }}>
                  <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7280', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 15, fontWeight: 700, color: '#F5F7FA' }}>{value}</div>
                </div>
              ))}
            </div>
            {item.type === 'team' && item.members?.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7280' }}>
                  Integrantes
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {item.members.map((member, index) => (
                    <div key={member.id || `${item.id}-member-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', padding: '10px 12px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: hexToRgba(tone.text, 0.12), color: tone.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Bebas Neue", sans-serif', fontSize: 22 }}>
                        {getInitials([member.nombre, member.apellido].filter(Boolean).join(' '))}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 13 }}>{[member.nombre, member.apellido].filter(Boolean).join(' ')}</div>
                        <div style={{ color: '#AAB2C0', fontSize: 12 }}>{[member.ciudad_pais, member.box].filter(Boolean).join(' • ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="button" onClick={onClose} style={{ width: '100%', minHeight: 44, borderRadius: 10, border: `1px solid ${hexToRgba(tone.text, 0.24)}`, background: hexToRgba(tone.text, 0.08), color: tone.text, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Cerrar ficha
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CompetitionPublicRosterPage() {
  const { competitionId } = useParams()
  const [competitionPayload, setCompetitionPayload] = useState(null)
  const [rosterPayload, setRosterPayload] = useState(null)
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategoryKey, setSelectedCategoryKey] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const [selectedParticipant, setSelectedParticipant] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [mobileView, setMobileView] = useState('cards')

  useEffect(() => {
    loadCountries().then(setCountries).catch(() => setCountries([]))
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      api.get(`/competitions/${competitionId}/public`),
      api.get(`/competitions/${competitionId}/public-roster`),
    ])
      .then(([competitionRes, rosterRes]) => {
        if (!active) return
        setCompetitionPayload(competitionRes.data || null)
        setRosterPayload(rosterRes.data || null)
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.detail || 'No se pudieron cargar los inscritos.')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [competitionId])

  useEffect(() => {
    document.body.classList.toggle('fr-modal-open', !!selectedParticipant)
    return () => document.body.classList.remove('fr-modal-open')
  }, [selectedParticipant])

  const competition = competitionPayload?.competition || null
  const theme = useMemo(() => resolveCompetitionTheme(competition), [competition])
  const pageBg = useMemo(() => buildPageBackground(theme), [theme])
  const countryCodeByName = useMemo(
    () => Object.fromEntries(countries.map((country) => [country.name.toLowerCase(), country.code.toLowerCase()])),
    [countries],
  )

  const rosterSections = useMemo(() => {
    const sections = []
    ;(rosterPayload?.individual || []).forEach((item) => {
      sections.push({
        key: buildCategoryKey('individual', item),
        modality: 'individual',
        category_name: item.category_name,
        participants: Array.isArray(item.participants) ? item.participants : [],
        teams: [],
      })
    })
    ;(rosterPayload?.teams || []).forEach((item) => {
      sections.push({
        key: buildCategoryKey('teams', item),
        modality: 'teams',
        category_name: item.category_name,
        participants: [],
        teams: Array.isArray(item.teams) ? item.teams : [],
      })
    })
    return sections
  }, [rosterPayload])

  const rosterItems = useMemo(() => buildRosterItems(rosterSections), [rosterSections])

  useEffect(() => {
    if (selectedCategoryKey === 'all') return
    if (rosterSections.some((section) => section.key === selectedCategoryKey)) return
    setSelectedCategoryKey('all')
  }, [rosterSections, selectedCategoryKey])

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT)
  }, [selectedCategoryKey, searchQuery])

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeText(searchQuery)
    return rosterItems.filter((item) => {
      const matchesCategory = selectedCategoryKey === 'all' || item.categoryKey === selectedCategoryKey
      const matchesSearch = !normalizedQuery || item.searchText.includes(normalizedQuery)
      return matchesCategory && matchesSearch
    })
  }, [rosterItems, searchQuery, selectedCategoryKey])

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount])

  const categoryTabs = useMemo(() => {
    const tabs = [{
      key: 'all',
      label: 'Todos',
      count: rosterItems.length,
    }]
    rosterSections.forEach((section) => {
      tabs.push({
        key: section.key,
        label: section.category_name,
        count: section.modality === 'teams' ? (section.teams?.length || 0) : (section.participants?.length || 0),
      })
    })
    return tabs
  }, [rosterItems.length, rosterSections])

  const stats = useMemo(() => {
    const visibleCountryCodes = new Set()
    rosterItems.forEach((item) => {
      const info = getCountryInfo(item.ciudad_pais, countryCodeByName)
      if (info.countryCode) visibleCountryCodes.add(info.countryCode)
    })
    return {
      athletes: rosterItems.length,
      countries: visibleCountryCodes.size,
      categories: rosterSections.length,
    }
  }, [countryCodeByName, rosterItems, rosterSections.length])

  const canLoadMore = filteredItems.length > visibleItems.length
  const selectedItemTone = buildCategoryTone(selectedParticipant?.categoryName || '', theme)
  const rosterGridColumns = isMobile && mobileView === 'cards'
    ? 'repeat(2, minmax(0, 1fr))'
    : isMobile
      ? '1fr'
      : 'repeat(auto-fill, minmax(220px, 1fr))'

  const renderRosterCollection = (items, sectionKey = 'section') => {
    if (mobileView === 'list' && isMobile) {
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => {
            const countryInfo = getCountryInfo(item.ciudad_pais, countryCodeByName)
            return (
              <AthleteListRow
                key={`${sectionKey}-${item.id}`}
                item={item}
                tone={buildCategoryTone(item.categoryName, theme)}
                flagUrl={countryInfo.flagUrl}
                onOpen={setSelectedParticipant}
              />
            )
          })}
        </div>
      )
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: rosterGridColumns, gap: 16 }}>
        {items.map((item, index) => {
          const countryInfo = getCountryInfo(item.ciudad_pais, countryCodeByName)
          return (
              <AthleteCard
                key={`${sectionKey}-${item.id}`}
                item={item}
                itemIndex={index}
                tone={buildCategoryTone(item.categoryName, theme)}
                flagUrl={countryInfo.flagUrl}
                onOpen={setSelectedParticipant}
                compact={isMobile}
              />
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: pageBg, backgroundSize: 'auto, 60px 60px, 60px 60px, auto', color: '#F5F7FA' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '32px 24px 72px', color: '#AAB2C0', fontSize: 14 }}>Cargando inscritos...</div>
        ) : error ? (
          <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '32px 24px 72px' }}>
            <div className="fr-cut-card" style={{ padding: 24, background: '#171B21', border: '1px solid #252A33', color: '#F5F7FA' }}>
              {error}
            </div>
          </div>
        ) : (
          <>
            <header style={{ position: 'sticky', top: 0, zIndex: 40, minHeight: isMobile ? 'auto' : 90, display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: 16, padding: isMobile ? '0 14px 12px' : '0 24px', borderBottom: '1px solid #252A33', background: `linear-gradient(180deg, ${hexToRgba(theme.accent || '#00C2A8', 0.025)} 0%, rgba(13,15,18,0.96) 100%)`, backdropFilter: 'blur(12px)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: isMobile ? 'none' : '1px solid #252A33', paddingRight: isMobile ? 0 : 20, paddingTop: isMobile ? 12 : 0, minHeight: isMobile ? 'auto' : 90 }}>
                  <Link to={competition ? `/competitions/${competition.id}` : '/events'} style={{ textDecoration: 'none', color: '#AAB2C0', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    <ArrowLeft size={14} />
                    Volver a la competencia
                  </Link>
                  <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: theme.accent || '#00C2A8' }}>
                    Temporada 2026
                  </div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 30, lineHeight: 1, letterSpacing: '0.04em', color: '#F5F7FA' }}>
                    {competition?.nombre || 'FinalRep Open'}
                  </div>
                </div>
                {[
                  ['Atletas', stats.athletes, '#F5F7FA'],
                  ['Paises', stats.countries, '#F5F7FA'],
                  ['Categorias', stats.categories, theme.accent || '#00C2A8'],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: isMobile ? '0 10px 0 0' : '0 18px', minHeight: isMobile ? 'auto' : 90 }}>
                    <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 34, lineHeight: 1, color }}>{value}</div>
                    <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7280', marginTop: 2 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: isMobile ? 'auto' : 90, paddingBottom: isMobile ? 0 : 12, flexWrap: 'wrap', justifyContent: 'flex-end', width: isMobile ? '100%' : undefined }}>
                {competition?.lugar ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 8, padding: '0 14px', border: '1px solid #252A33', background: 'rgba(255,255,255,0.04)', color: '#AAB2C0', fontSize: 12, fontWeight: 700, width: isMobile ? '100%' : undefined }}>
                    <MapPin size={14} />
                    {competition.lugar}
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : 'auto auto', gap: 12, width: isMobile ? '100%' : undefined, alignItems: 'center' }}>
                  <CatDropdown
                    activeCat={selectedCategoryKey}
                    setActiveCat={setSelectedCategoryKey}
                    options={categoryTabs.filter((tab) => tab.key !== 'all')}
                    allCount={rosterItems.length}
                    theme={theme}
                  />
                  {isMobile ? (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 4,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: 'rgba(255,255,255,0.05)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}>
                        <button
                          type="button"
                          aria-label="Ver atletas en tarjetas"
                          onClick={() => setMobileView('cards')}
                          style={{
                            width: 40,
                            height: 40,
                            padding: 0,
                            borderRadius: 10,
                            border: 'none',
                            background: mobileView === 'cards'
                              ? `linear-gradient(135deg, ${hexToRgba(theme.accent || '#00C2A8', 0.24)} 0%, ${hexToRgba(theme.accent || '#00C2A8', 0.14)} 100%)`
                              : 'transparent',
                          color: mobileView === 'cards' ? '#F5F7FA' : '#AAB2C0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          fontFamily: '"Barlow Condensed", sans-serif',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                            boxShadow: mobileView === 'cards' ? `inset 0 0 0 1px ${hexToRgba(theme.accent || '#00C2A8', 0.28)}` : 'none',
                          }}
                        >
                          <LayoutGrid size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label="Ver atletas en lista"
                          onClick={() => setMobileView('list')}
                          style={{
                            width: 40,
                            height: 40,
                            padding: 0,
                            borderRadius: 10,
                            border: 'none',
                            background: mobileView === 'list'
                              ? `linear-gradient(135deg, ${hexToRgba(theme.accent || '#00C2A8', 0.24)} 0%, ${hexToRgba(theme.accent || '#00C2A8', 0.14)} 100%)`
                              : 'transparent',
                          color: mobileView === 'list' ? '#F5F7FA' : '#AAB2C0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          fontFamily: '"Barlow Condensed", sans-serif',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                            boxShadow: mobileView === 'list' ? `inset 0 0 0 1px ${hexToRgba(theme.accent || '#00C2A8', 0.28)}` : 'none',
                          }}
                        >
                          <List size={16} />
                        </button>
                    </div>
                  ) : null}
                </div>
                <label style={{ position: 'relative', minWidth: isMobile ? '100%' : 240, width: isMobile ? '100%' : undefined }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none' }} />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar atleta, pais o box"
                    style={{ width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid #252A33', background: 'rgba(255,255,255,0.04)', color: '#F5F7FA', fontSize: 13, padding: '0 14px 0 36px', outline: 'none' }}
                  />
                </label>
              </div>
            </header>

            {!rosterPayload?.enabled ? (
              <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '32px 24px 72px' }}>
                <div className="fr-cut-card" style={{ padding: 24, background: '#171B21', border: '1px solid #252A33', color: '#AAB2C0', lineHeight: 1.6 }}>
                  Esta competencia no tiene publicados sus inscritos todavia.
                </div>
              </div>
            ) : (
              <>
                <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '32px 24px 72px', display: 'grid', gap: 32 }}>
                  {selectedCategoryKey === 'all' && !searchQuery.trim()
                    ? rosterSections.map((section) => {
                        const items = rosterItems.filter((item) => item.categoryKey === section.key)
                        if (!items.length) return null
                        return (
                          <section key={section.key} style={{ display: 'grid', gap: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 24, letterSpacing: '0.05em', color: '#6B7280' }}>{section.category_name}</div>
                              <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: theme.accent || '#00C2A8' }}>
                                {items.length} atletas
                              </div>
                            </div>
                            {renderRosterCollection(items, section.key)}
                          </section>
                        )
                      })
                    : (
                      <section style={{ display: 'grid', gap: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                          <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 24, letterSpacing: '0.05em', color: '#6B7280' }}>
                            {searchQuery.trim()
                              ? 'Resultados'
                              : (categoryTabs.find((tab) => tab.key === selectedCategoryKey)?.label || 'Categoria')}
                          </div>
                          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: theme.accent || '#00C2A8' }}>
                            {filteredItems.length} atletas
                          </div>
                        </div>
                        {visibleItems.length ? (
                          renderRosterCollection(visibleItems, selectedCategoryKey)
                        ) : (
                          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', color: '#6B7280', textAlign: 'center', padding: '60px 24px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {searchQuery.trim() ? 'No se encontraron atletas' : 'Aun no hay inscritos confirmados en esta categoria'}
                          </div>
                        )}
                        {canLoadMore ? (
                          <button
                            type="button"
                            onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_COUNT)}
                            style={{ justifySelf: 'flex-start', minHeight: 42, borderRadius: 999, border: '1px solid #252A33', background: 'rgba(255,255,255,0.04)', color: '#F5F7FA', padding: '0 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                          >
                            Ver mas
                          </button>
                        ) : null}
                      </section>
                    )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <AthleteModal
        item={selectedParticipant}
        onClose={() => setSelectedParticipant(null)}
        tone={selectedItemTone}
        countryCodeByName={countryCodeByName}
      />
    </div>
  )
}
