'use client'

import { useEffect, useRef, useMemo } from 'react'
import { getDisplayStoreCode } from '@/lib/utils'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
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
  store_code: string | null
  store_name: string
  latitude: number
  longitude: number
  region: string | null
  compliance_audit_2_planned_date: string | null
}

interface ManagerHome {
  latitude: number
  longitude: number
  address: string
}

// Area name mapping
const areaNames: Record<string, string> = {
  'A1': 'Scotland & North East',
  'A2': 'Yorkshire & Midlands',
  'A3': 'Manchester',
  'A4': 'Lancashire & Merseyside',
  'A5': 'Birmingham',
  'A6': 'Wales',
  'A7': 'South',
  'A8': 'London',
}

// Helper function to get area display name
function getAreaDisplayName(areaCode: string | null): string {
  if (!areaCode) return 'All Areas'
  const name = areaNames[areaCode]
  return name ? `${areaCode} - ${name}` : areaCode
}

interface MapComponentProps {
  stores: Store[]
  managerHome: ManagerHome | null
  selectedStores: Set<string>
  onStoreSelect: (storeId: string) => void
  filteredArea: string | null
}

// Color mapping for different areas
const areaColors: Record<string, string> = {
  'A1': 'blue',
  'A2': 'red',
  'A3': 'green',
  'A4': 'orange',
  'A5': 'gold',  // Changed from purple to gold to differentiate from A2
  'A6': 'yellow',
  'A7': 'violet',
  'A8': 'grey',
  'WHSE 1': 'black',
  'WHSE 2': 'darkblue',
  'Photo': 'pink',
  'SEVEN': 'darkgreen',
}

function getAreaIcon(area: string | null, isSelected: boolean) {
  const color = area ? (areaColors[area] || 'blue') : 'blue'
  
  // If selected, use a larger icon with a border effect
  if (isSelected) {
    // Create a custom icon with a border for selected stores
    const iconSize: [number, number] = [35, 55] // Larger for selected
    return L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: iconSize,
      iconAnchor: [iconSize[0] / 2, iconSize[1]],
      popupAnchor: [1, -iconSize[1] + 10],
      shadowSize: [50, 50],
      className: 'selected-store-marker', // Add class for custom styling
    })
  }
  
  // Regular icon for unselected stores
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })
}

// Component to fit map bounds
function MapBounds({ stores, managerHome }: { stores: Store[], managerHome: ManagerHome | null }) {
  const map = useMap()

  useEffect(() => {
    if (stores.length === 0 && !managerHome) return

    const bounds = L.latLngBounds([])
    
    stores.forEach(store => {
      bounds.extend([store.latitude, store.longitude])
    })
    
    if (managerHome) {
      bounds.extend([managerHome.latitude, managerHome.longitude])
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [stores, managerHome, map])

  return null
}

export default function MapComponent({ stores, managerHome, selectedStores, onStoreSelect, filteredArea }: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapKey = useMemo(() => {
    const homeKey = managerHome ? `${managerHome.latitude},${managerHome.longitude}` : 'no-home'
    return `${filteredArea || 'all'}|${stores.length}|${homeKey}`
  }, [filteredArea, stores.length, managerHome])

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

  // Default center (UK)
  const defaultCenter: [number, number] = [54.5, -2.0]
  const defaultZoom = 6

  // Filter stores: if there are selected stores, only show those. Otherwise show all stores in the filtered area
  const visibleStores = useMemo(() => {
    let filtered = stores
    
    // First filter by area if filter is set
    if (filteredArea) {
      filtered = filtered.filter(s => s.region === filteredArea)
    }
    
    // If there are selected stores, only show those
    if (selectedStores.size > 0) {
      filtered = filtered.filter(s => selectedStores.has(s.id))
    }
    
    return filtered
  }, [stores, filteredArea, selectedStores])

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

  if (typeof window === 'undefined') {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500">
        Loading map...
      </div>
    )
  }

  // If no stores and no manager home, show message
  if (stores.length === 0 && !managerHome) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <p className="font-medium mb-2">No locations to display</p>
          <p className="text-sm">Add latitude/longitude to stores and manager home addresses to see them on the map.</p>
        </div>
      </div>
    )
  }

  return (
    <MapContainer
      key={mapKey}
      center={defaultCenter}
      zoom={defaultZoom}
      style={{ height: '100%', width: '100%' }}
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapBounds stores={visibleStores} managerHome={managerHome} />

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
      {visibleStores.map((store) => {
        const hasPlannedDate = store.compliance_audit_2_planned_date !== null
        const isSelected = selectedStores.has(store.id)
        // Use selected icon if store is selected
        const icon = getAreaIcon(store.region, isSelected)
        
        return (
          <Marker
            key={store.id}
            position={[store.latitude, store.longitude]}
            icon={icon}
            eventHandlers={{
              click: () => onStoreSelect(store.id),
            }}
          >
            <Popup>
              <div className="font-semibold">{store.store_name}</div>
              {getDisplayStoreCode(store.store_code) && (
                <div className="text-sm text-slate-600">Code: {getDisplayStoreCode(store.store_code)}</div>
              )}
              {store.region && (
                <div className="text-sm text-slate-500">Area: {getAreaDisplayName(store.region)}</div>
              )}
              {isSelected && (
                <div className="text-sm text-blue-600 font-medium mt-1">
                  ✓ Selected for route
                </div>
              )}
              {hasPlannedDate && (
                <div className="text-sm text-green-600 mt-1">
                  ✓ Planned: {new Date(store.compliance_audit_2_planned_date!).toLocaleDateString()}
                </div>
              )}
              <div className="text-xs text-slate-500 mt-1">Click to {isSelected ? 'deselect' : 'select'}</div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
