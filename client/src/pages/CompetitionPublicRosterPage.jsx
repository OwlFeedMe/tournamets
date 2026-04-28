import { useParams } from 'react-router-dom'
import CompetitionRosterPanel from '../components/competition/CompetitionRosterPanel'

export default function CompetitionPublicRosterPage() {
  const { competitionId } = useParams()

  return <CompetitionRosterPanel competitionId={competitionId} />
}
