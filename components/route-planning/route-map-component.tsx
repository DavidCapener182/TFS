'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatStoreName } from '@/lib/store-display'
import { getDisplayStoreCode } from '@/lib/utils'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'
import { getRouteStopMarkerIcon } from './map-marker-icons'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface Store {
  id: string
  store_name: string
  store_code: string | null
  latitude: number | null
  longitude: number | null
}

interface ManagerHome {
  latitude: number
  longitude: number
  address: string
}

interface RouteMapComponentProps {
  stores: Store[]
  managerHome: ManagerHome | null
}

// Create custom home icon using SVG
const homeIconSvg = `
  <div style="background: white; border-radius: 50%; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="#dcfce7"/>
    </svg>
  </div>
`

const homeIcon = L.divIcon({
  className: 'custom-home-icon',
  html: homeIconSvg,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
})

// Component to fit map bounds
function MapBounds({ stores, managerHome }: { stores: Store[], managerHome: ManagerHome | null }) {
  const map = useMap()

  useEffect(() => {
    const locations: [number, number][] = []
    
    stores.forEach(store => {
      if (store.latitude && store.longitude) {
        locations.push([store.latitude, store.longitude])
      }
    })
    
    if (managerHome) {
      locations.push([managerHome.latitude, managerHome.longitude])
    }

    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations)
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [stores, managerHome, map])

  return null
}

function isLatLngTuple(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length < 2) return false
  const latitude = value[0]
  const longitude = value[1]
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export default function RouteMapComponent({ stores, managerHome }: RouteMapComponentProps) {
  const mapRef = useRef<L.Map | null>(null)
  const [roadRouteCoordinates, setRoadRouteCoordinates] = useState<[number, number][]>([])
  const [isFallbackRoute, setIsFallbackRoute] = useState(false)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)

  // Filter stores with coordinates
  const storesWithCoords = useMemo(
    () => stores.filter((store) => store.latitude && store.longitude),
    [stores]
  )

  // Default center (UK)
  const defaultCenter: [number, number] = [54.5, -2.0]
  const defaultZoom = 6
  const mapKey = useMemo(() => {
    const homeKey = managerHome ? `${managerHome.latitude},${managerHome.longitude}` : 'no-home'
    return `${storesWithCoords.length}|${homeKey}`
  }, [storesWithCoords.length, managerHome])

  useEffect(() => {
    return () => {
      if (!mapRef.current) return
      try {
        mapRef.current.remove()
      } catch {
        // Ignore cleanup race conditions during fast refresh.
      } finally {
        mapRef.current = null
      }
    }
  }, [])

  // Build waypoint order for the route (home -> stores -> home)
  const routeCoordinates = useMemo(() => {
    const coords: [number, number][] = []
    
    if (managerHome) {
      coords.push([managerHome.latitude, managerHome.longitude])
    }
    
    storesWithCoords.forEach(store => {
      if (store.latitude && store.longitude) {
        coords.push([store.latitude, store.longitude])
      }
    })
    
    if (managerHome && coords.length > 1) {
      // Return to home
      coords.push([managerHome.latitude, managerHome.longitude])
    }
    
    return coords
  }, [storesWithCoords, managerHome])

  useEffect(() => {
    if (routeCoordinates.length < 2) {
      setRoadRouteCoordinates([])
      setIsFallbackRoute(false)
      setIsLoadingRoute(false)
      return
    }

    const controller = new AbortController()
    let isCancelled = false

    const fetchRoadRoute = async () => {
      setIsLoadingRoute(true)
      setIsFallbackRoute(false)

      try {
        const waypoints = routeCoordinates.map(([latitude, longitude]) => ({ latitude, longitude }))
        let coordinates: [number, number][] = []
        let lastError: Error | null = null

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch('/api/route-planning/road-route', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ waypoints }),
              signal: controller.signal,
            })

            if (!response.ok) {
              throw new Error(`Routing API failed with status ${response.status}`)
            }

            const data = (await response.json()) as { coordinates?: unknown }
            coordinates = Array.isArray(data.coordinates) ? data.coordinates.filter(isLatLngTuple) : []

            if (coordinates.length < 2) {
              throw new Error('Routing API returned no geometry')
            }

            break
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown routing failure')
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 300))
            }
          }
        }

        if (coordinates.length < 2) {
          throw lastError || new Error('Routing API returned no geometry')
        }

        if (!isCancelled) {
          setRoadRouteCoordinates(coordinates)
          setIsFallbackRoute(false)
          setIsLoadingRoute(false)
        }
      } catch (error) {
        if (controller.signal.aborted || isCancelled) return

        console.warn('Falling back to straight-line route geometry:', error)
        setRoadRouteCoordinates([])
        setIsFallbackRoute(true)
        setIsLoadingRoute(false)
      }
    }

    fetchRoadRoute()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [routeCoordinates])

  const displayedRouteCoordinates = roadRouteCoordinates.length > 1
    ? roadRouteCoordinates
    : (isFallbackRoute && !isLoadingRoute ? routeCoordinates : [])

  if (typeof window === 'undefined') {
    return (
      <div className="w-full h-[400px] bg-slate-100 flex items-center justify-center text-slate-500 rounded-lg">
        Loading map...
      </div>
    )
  }

  if (storesWithCoords.length === 0 && !managerHome) {
    return (
      <div className="w-full h-[400px] bg-slate-100 flex items-center justify-center text-slate-500 rounded-lg">
        <div className="text-center">
          <p className="font-medium mb-2">No locations to display</p>
          <p className="text-sm">Stores need coordinates to show on the map.</p>
        </div>
      </div>
    )
  }

  return (
    <MapContainer
      key={mapKey}
      center={defaultCenter}
      zoom={defaultZoom}
      style={{ height: '400px', width: '100%', borderRadius: '0.5rem' }}
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapBounds stores={storesWithCoords} managerHome={managerHome} />

      {/* Route polyline */}
      {displayedRouteCoordinates.length > 1 && (
        <Polyline
          positions={displayedRouteCoordinates}
          color={isFallbackRoute ? '#64748b' : '#3b82f6'}
          weight={4}
          opacity={isFallbackRoute ? 0.55 : 0.75}
          dashArray={isFallbackRoute ? '8 8' : undefined}
          smoothFactor={0}
        />
      )}

      {/* Manager Home Marker */}
      {managerHome && managerHome.latitude && managerHome.longitude && (
        <Marker
          position={[Number(managerHome.latitude), Number(managerHome.longitude)]}
          icon={homeIcon}
        >
          <Popup>
            <div className="font-semibold">Manager Home</div>
            <div className="text-sm text-slate-600">{managerHome.address}</div>
          </Popup>
        </Marker>
      )}

      {/* Store Markers */}
      {storesWithCoords.map((store, index) => {
        return (
          <Marker
            key={store.id}
            position={[store.latitude!, store.longitude!]}
            icon={getRouteStopMarkerIcon(index + 1)}
          >
            <Popup>
              <div className="font-semibold">{formatStoreName(store.store_name)}</div>
              {getDisplayStoreCode(store.store_code) && (
                <div className="text-sm text-slate-600">Code: {getDisplayStoreCode(store.store_code)}</div>
              )}
              <div className="text-xs text-blue-600 mt-1">Stop {index + 1}</div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
