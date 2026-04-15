let countriesCache = null
let citiesDataPromise = null
const citiesCache = new Map()

function normalizeCityRow(row) {
  if (!row) return null
  if (Array.isArray(row)) {
    const [name, countryCode] = row
    if (!name || !countryCode) return null
    return {
      name: String(name).trim(),
      countryCode: String(countryCode).trim().toUpperCase(),
    }
  }
  if (typeof row === 'object') {
    const name = row.name || row.city || row.cityName
    const countryCode = row.countryCode || row.country_code || row.isoCode
    if (!name || !countryCode) return null
    return {
      name: String(name).trim(),
      countryCode: String(countryCode).trim().toUpperCase(),
    }
  }
  return null
}

async function loadJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url}`)
  }
  return response.json()
}

async function loadCountriesData() {
  if (countriesCache) return countriesCache

  const rawCountries = await loadJson('/data/countries.json')
  countriesCache = rawCountries
    .map((country) => ({
      code: country.isoCode,
      name: country.name,
      phoneCode: String(country.phonecode || '').replace(/\D/g, ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return countriesCache
}

function loadCitiesData() {
  if (!citiesDataPromise) {
    citiesDataPromise = loadJson('/data/cities.json')
  }
  return citiesDataPromise
}

export async function loadCountries() {
  return loadCountriesData()
}

export async function loadCitiesByCountry(countryCode) {
  if (!countryCode) return []
  const normalizedCountryCode = String(countryCode).trim().toUpperCase()
  if (citiesCache.has(normalizedCountryCode)) return citiesCache.get(normalizedCountryCode)

  const cityRows = await loadCitiesData()
  const cities = cityRows
    .map(normalizeCityRow)
    .filter((city) => city?.countryCode === normalizedCountryCode)
    .map((city) => city.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'))
  citiesCache.set(normalizedCountryCode, cities)
  return cities
}

export function parseCityCountry(value) {
  const raw = (value || '').trim()
  if (!raw) return { city: '', countryName: '', countryCode: '' }
  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return { city: raw, countryName: '', countryCode: '' }
  const countryName = parts.at(-1)
  const city = parts.slice(0, -1).join(' / ')
  return {
    city,
    countryName,
    countryCode: '',
  }
}

export function buildCityCountry(city, countryName) {
  const cleanCity = (city || '').trim()
  const cleanCountry = (countryName || '').trim()
  if (!cleanCity || !cleanCountry) return ''
  return `${cleanCity} / ${cleanCountry}`
}
