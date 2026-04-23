import { getHomePath } from '../context/AuthContext'

export function getCompetitionEnrollmentNavigationTarget({ session, isAthlete, role, competition, enrollmentState }) {
  if (!session) return '/login'
  if (!isAthlete) return getHomePath(role)
  if (!competition?.id) return null
  if (enrollmentState && enrollmentState !== 'rechazado') return null
  if (!competition.enrollment_open) return null
  return `/competitions/${competition.id}/register`
}
