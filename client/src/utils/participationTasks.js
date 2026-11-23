export function participationTasks(competitions = []) {
  return competitions.flatMap(competition => {
    const qualified = competition.open_status === 'qualified' || competition.enrollment_estado === 'open_qualified'
    const confirmed = competition.open_status === 'confirmed' || competition.enrollment_estado === 'confirmado'
    const needsPhoto = (qualified || confirmed) && competition.avatar_photo_required && !competition.avatar_photo_uploaded
    if (!qualified && !needsPhoto) return []
    return [{ competition, needsPayment: qualified, needsPhoto, href: `/competitions/${competition.id}/participation` }]
  })
}
