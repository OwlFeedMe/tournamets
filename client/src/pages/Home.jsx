import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import {
  CommandStrip,
  CompetitionGrid,
  CompetitionSearch,
  CompetitionSectionHeader,
  HomeCompetitionCard,
  HomeEmptyState,
  HomeHero,
} from '../components/home/HomeSections'
import {
  buildCommandItems,
  buttonStateForCompetition,
  filterCompetitionsByQuery,
  getCompetitionState,
  homePageBg,
  mapCompetitionViewModel,
} from '../components/home/homeModel'
import { getHomePath, useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import { getMissingParticipantProfileFields } from '../utils/participantProfile'

export default function Home() {
  const navigate = useNavigate()
  const { session, role, participantId, isAthlete } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [myComps, setMyComps] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/competitions?scope=public').catch(() => ({ data: [] })),
      isAthlete && participantId
        ? api.get(`/participants/${participantId}/competitions`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])
      .then(([competitionsResponse, mineResponse]) => {
        if (!active) return
        setCompetitions(Array.isArray(competitionsResponse.data) ? competitionsResponse.data : [])
        setMyComps(Array.isArray(mineResponse.data) ? mineResponse.data : [])
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isAthlete, participantId, role])

  const enrollmentByComp = useMemo(() => {
    const map = {}
    for (const competition of myComps) {
      map[competition.id] = competition.enrollment_estado || null
    }
    return map
  }, [myComps])

  const featuredCompetitions = useMemo(() => {
    return [...competitions]
      .sort((a, b) => {
        const stateDiff = getCompetitionState(a).weight - getCompetitionState(b).weight
        if (stateDiff !== 0) return stateDiff
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      .slice(0, 6)
  }, [competitions])

  const filteredCompetitions = useMemo(
    () => filterCompetitionsByQuery(featuredCompetitions, query),
    [featuredCompetitions, query]
  )

  const competitionCards = useMemo(
    () => filteredCompetitions.map((competition, index) => mapCompetitionViewModel(competition, index)),
    [filteredCompetitions]
  )

  const commandItems = useMemo(() => buildCommandItems(featuredCompetitions), [featuredCompetitions])
  const openCount = featuredCompetitions.filter(item => item.enrollment_open).length
  const activeCount = featuredCompetitions.filter(item => item.activa).length

  const handleParticipate = async (competition) => {
    if (!session) {
      navigate('/login')
      return
    }
    if (!isAthlete) {
      navigate(getHomePath(role))
      return
    }
    if (enrollmentByComp[competition.id] && enrollmentByComp[competition.id] !== 'rechazado') return
    if (!competition.enrollment_open) return
    try {
      const { data } = await api.get('/participants/me')
      const missingFields = getMissingParticipantProfileFields(data)
      if (missingFields.length) {
        navigate('/profile', {
          state: {
            profileRequiredForEnrollment: true,
            missingFields,
            competitionName: competition.nombre || '',
          },
        })
        return
      }
    } catch {
      navigate('/profile', {
        state: {
          profileRequiredForEnrollment: true,
          missingFields: ['perfil'],
          competitionName: competition.nombre || '',
        },
      })
      return
    }
    navigate(`/competitions/${competition.id}/register`)
  }

  return (
    <div style={{ minHeight: '100vh', background: homePageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 72px' }}>
        <HomeHero
          isMobile={isMobile}
          session={session}
          totalCompetitions={featuredCompetitions.length}
          openCount={openCount}
          activeCount={activeCount}
          panelHref={session ? getHomePath(session.role) : '/login'}
        />

        <CommandStrip items={commandItems} isMobile={isMobile} />

        <section>
          <CompetitionSectionHeader totalVisible={competitionCards.length} query={query} />
          <CompetitionSearch value={query} onChange={setQuery} />

          {loading ? (
            <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando competencias...</div>
          ) : competitionCards.length ? (
            <CompetitionGrid
              competitions={competitionCards}
              isMobile={isMobile}
              renderCard={(competition, index) => (
                <HomeCompetitionCard
                  competition={competition}
                  index={index}
                  isFeatured={index === 0}
                  isAthlete={isAthlete}
                  enrollmentState={enrollmentByComp[competition.id]}
                  onParticipate={handleParticipate}
                  getButtonState={buttonStateForCompetition}
                />
              )}
            />
          ) : (
            <HomeEmptyState hasCompetitions={featuredCompetitions.length > 0} />
          )}
        </section>
      </div>
    </div>
  )
}
