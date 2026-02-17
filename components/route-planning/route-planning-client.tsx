'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, Route, Calendar, Home, Trash2, Filter, Plus, CheckCircle2, Sparkles, Loader2, Edit2, X, ChevronUp, ChevronDown, ShieldCheck, ArrowUpRight } from 'lucide-react'
import dynamic from 'next/dynamic'
import { updateRoutePlannedDate, updateManagerHomeAddress, getRouteOperationalItems, deleteAllRouteVisitTimes, deleteAllRouteOperationalItems } from '@/app/actions/route-planning'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RouteDirectionsModal } from './route-directions-modal'
import { getDisplayStoreCode } from '@/lib/utils'

// Dynamically import the map component to avoid SSR issues
const MapComponent = dynamic(() => import('./map-component'), { ssr: false })
const MULTI_AREA_REGION = 'MULTI'

// Area name mapping
const areaNames: Record<string, string> = {
  [MULTI_AREA_REGION]: 'Multi-Area Route',
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
  if (areaCode === MULTI_AREA_REGION) return areaNames[MULTI_AREA_REGION]
  const name = areaNames[areaCode]
  return name ? `${areaCode} - ${name}` : areaCode
}

interface Store {
  id: string
  store_code: string | null
  store_name: string
  address_line_1: string | null
  city: string | null
  postcode: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  compliance_audit_1_date: string | null
  compliance_audit_1_overall_pct: number | null
  compliance_audit_2_date: string | null
  compliance_audit_2_planned_date: string | null
  compliance_audit_2_assigned_manager_user_id: string | null
  route_sequence: number | null
  assigned_manager?: {
    id: string
    full_name: string | null
    home_address: string | null
    home_latitude: number | null
    home_longitude: number | null
  } | null
}

interface StoreWithCoords extends Store {
  latitude: number
  longitude: number
}

interface Profile {
  id: string
  full_name: string | null
  home_address: string | null
  home_latitude: number | null
  home_longitude: number | null
}

interface RoutePlanningClientProps {
  initialData: {
    stores: Store[]
    profiles: Profile[]
  }
}

function getPlannedRouteGroupKey(plannedDate: string, managerId: string | null | undefined): string {
  return `${plannedDate || 'undated'}-${managerId || 'unassigned'}`
}

function getRouteRegion(stores: Store[]): string | null {
  const uniqueRegions = Array.from(
    new Set(stores.map((store) => store.region).filter((region): region is string => Boolean(region)))
  )
  if (uniqueRegions.length === 1) return uniqueRegions[0]
  if (uniqueRegions.length > 1) return MULTI_AREA_REGION
  return null
}

export function RoutePlanningClient({ initialData }: RoutePlanningClientProps) {
  const router = useRouter()
  const [stores, setStores] = useState(initialData.stores)
  const [profiles] = useState(initialData.profiles)
  
  // Update stores when initialData changes (after router.refresh())
  useEffect(() => {
    setStores(initialData.stores)
  }, [initialData])
  const [selectedManager, setSelectedManager] = useState<string | undefined>(undefined)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [storeToDelete, setStoreToDelete] = useState<{ id: string; name: string } | null>(null)
  
  // Route creation state
  const [routeManager, setRouteManager] = useState<string | undefined>(undefined)
  const [routeDate, setRouteDate] = useState<string>('')
  const [routeArea, setRouteArea] = useState<string | null>(null)
  const [routeSelectedStores, setRouteSelectedStores] = useState<Set<string>>(new Set())
  const [routeStopLimit, setRouteStopLimit] = useState<number>(3)
  const [maxDriveMinutes, setMaxDriveMinutes] = useState<string>('')
  const [maxRouteHours, setMaxRouteHours] = useState<string>('')
  const [optimizerPriority, setOptimizerPriority] = useState<'balanced' | 'min_drive' | 'tight_cluster'>('balanced')
  const [requireHomeStart, setRequireHomeStart] = useState(true)
  const [requireHomeEnd, setRequireHomeEnd] = useState(true)
  const [optimizationSummary, setOptimizationSummary] = useState<string | null>(null)
  const [isCreatingRoute, setIsCreatingRoute] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [editingRouteGroup, setEditingRouteGroup] = useState<string | null>(null)
  const [selectedRouteForDirections, setSelectedRouteForDirections] = useState<{
    stores: Store[]
    managerHome: { latitude: number; longitude: number; address: string } | null
    managerName: string
    plannedDate: string
    managerUserId: string | null
    region: string | null
  } | null>(null)
  // Track store order for each route group
  const [routeStoreOrder, setRouteStoreOrder] = useState<Record<string, string[]>>({})
  // Track operational items for each route group
  const [routeOperationalItems, setRouteOperationalItems] = useState<Record<string, Array<{ title: string; start_time: string }>>>({})

  useEffect(() => {
    if (routeSelectedStores.size <= routeStopLimit) return
    const trimmed = Array.from(routeSelectedStores).slice(0, routeStopLimit)
    setRouteSelectedStores(new Set(trimmed))
  }, [routeStopLimit, routeSelectedStores])

  // Get selected manager's home location
  const managerHome = useMemo(() => {
    if (!selectedManager) return null
    const manager = profiles.find(p => p.id === selectedManager)
    if (!manager || !manager.home_latitude || !manager.home_longitude) return null
    // Convert string coordinates to numbers
    const lat = typeof manager.home_latitude === 'string' 
      ? parseFloat(manager.home_latitude) 
      : manager.home_latitude
    const lng = typeof manager.home_longitude === 'string' 
      ? parseFloat(manager.home_longitude) 
      : manager.home_longitude
    
    if (isNaN(lat) || isNaN(lng)) return null
    
    return {
      latitude: lat,
      longitude: lng,
      address: manager.home_address || 'Manager Home',
    }
  }, [selectedManager, profiles])

  // Get unique areas for filter
  const uniqueAreas = useMemo<string[]>(() => {
    const areas = new Set<string>(
      (stores.map(s => s.region || '').filter(Boolean) as string[])
    )
    return Array.from(areas).sort()
  }, [stores])

  // Filter stores available for planning (not planned, not completed within 6 months, not completed today)
  const storesAvailableForPlanning = useMemo<Store[]>(() => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    sixMonthsAgo.setHours(0, 0, 0, 0) // Start of day
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    return stores.filter(s => {
      // Hide stores that have been planned (for map display only)
      if (s.compliance_audit_2_planned_date) return false
      
      // Hide stores that completed audit 1 TODAY (2026) - they just finished, so hide them
      // We're starting fresh for 2026, so we only care about 2026 audit dates
      if (s.compliance_audit_1_date) {
        const audit1Date = new Date(s.compliance_audit_1_date)
        audit1Date.setHours(0, 0, 0, 0)
        
        // Only check if audit 1 was completed today (2026)
        // Disregard all 2025 audits - we're starting fresh for 2026
        if (audit1Date.getTime() === today.getTime()) {
          // Debug logging for Speke specifically
          if (s.store_code === 'S0042' || s.store_name?.toLowerCase().includes('speke')) {
            console.log('Speke store filtering (audit 1 completed today):', {
              store_name: s.store_name,
              store_code: s.store_code,
              compliance_audit_1_date: s.compliance_audit_1_date,
              audit1Date: audit1Date.toISOString(),
              today: today.toISOString(),
              shouldHide: true
            })
          }
          return false // Hide stores that completed audit 1 today
        }
      }
      
      // Hide stores that completed audit 2 from 2025 within the last 6 months
      // (But we're starting fresh for 2026, so this is mainly for stores that completed audit 2 recently)
      if (s.compliance_audit_2_date) {
        const audit2Date = new Date(s.compliance_audit_2_date)
        audit2Date.setHours(0, 0, 0, 0)
        
        // Only hide if audit 2 was completed within last 6 months (from 2025)
        // This ensures stores that recently completed audit 2 are hidden
        if (audit2Date >= sixMonthsAgo) {
          return false
        }
      }
      
      return true
    })
  }, [stores])

  // Stores with valid coordinates are used for map display and route optimization.
  const storesWithLocations = useMemo<StoreWithCoords[]>(() => {
    return storesAvailableForPlanning
      .filter((s): s is StoreWithCoords => (
        s.latitude !== null &&
        s.longitude !== null &&
        Number.isFinite(Number(s.latitude)) &&
        Number.isFinite(Number(s.longitude))
      ))
      .map((s) => ({
        ...s,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
      }))
  }, [storesAvailableForPlanning])

  // Get stores in the selected area (or all areas) for route building table.
  const storesInRouteArea = useMemo(() => {
    const candidateStores = routeArea
      ? storesAvailableForPlanning.filter((s) => s.region === routeArea)
      : storesAvailableForPlanning

    return [...candidateStores].sort((a, b) => {
      const areaA = a.region || 'ZZZ'
      const areaB = b.region || 'ZZZ'
      if (areaA !== areaB) return areaA.localeCompare(areaB)
      return a.store_name.localeCompare(b.store_name)
    })
  }, [routeArea, storesAvailableForPlanning])

  const storesInRouteAreaWithLocations = useMemo(() => {
    const candidateStores = routeArea
      ? storesWithLocations.filter((s) => s.region === routeArea)
      : storesWithLocations

    return [...candidateStores].sort((a, b) => {
      const areaA = a.region || 'ZZZ'
      const areaB = b.region || 'ZZZ'
      if (areaA !== areaB) return areaA.localeCompare(areaB)
      return a.store_name.localeCompare(b.store_name)
    })
  }, [routeArea, storesWithLocations])

  // Get stores with planned dates, grouped by manager + planned date.
  const plannedRoutes = useMemo(() => {
    const storesWithPlannedDates = stores.filter(s => s.compliance_audit_2_planned_date)
    
    // Group by planned date + manager to support mixed-area routes in one plan.
    const grouped = storesWithPlannedDates.reduce((acc, store) => {
      const plannedDate = store.compliance_audit_2_planned_date || ''
      const key = getPlannedRouteGroupKey(plannedDate, store.compliance_audit_2_assigned_manager_user_id)
      if (!acc[key]) {
        acc[key] = {
          plannedDate,
          managerId: store.compliance_audit_2_assigned_manager_user_id || null,
          assignedManager: store.assigned_manager,
          stores: []
        }
      }
      acc[key].stores.push(store)
      return acc
    }, {} as Record<string, {
      plannedDate: string
      managerId: string | null
      assignedManager: any
      stores: Store[]
    }>)

    // Convert to array and sort by date, then apply custom ordering
    return Object.entries(grouped).map(([key, group]) => {
      const region = getRouteRegion(group.stores)
      // If we have a custom order for this route, apply it
      if (routeStoreOrder[key] && routeStoreOrder[key].length === group.stores.length) {
        const orderedStores = routeStoreOrder[key]
          .map(storeId => group.stores.find(s => s.id === storeId))
          .filter(Boolean) as Store[]
        // Add any stores not in the order (shouldn't happen, but safety check)
        const orderedIds = new Set(orderedStores.map(s => s.id))
        const remainingStores = group.stores.filter(s => !orderedIds.has(s.id))
        return {
          ...group,
          region,
          _groupKey: key, // Store the stable key
          stores: [...orderedStores, ...remainingStores]
        }
      }
      // Otherwise, sort by route_sequence from database
      const sortedStores = [...group.stores].sort((a, b) => {
        if (a.route_sequence !== null && b.route_sequence !== null) {
          return a.route_sequence - b.route_sequence
        }
        if (a.route_sequence !== null) return -1
        if (b.route_sequence !== null) return 1
        return 0
      })
      return {
        ...group,
        region,
        _groupKey: key, // Store the stable key
        stores: sortedStores
      }
    }).sort((a, b) => {
      const dateA = a.plannedDate || ''
      const dateB = b.plannedDate || ''
      return dateA.localeCompare(dateB)
    })
  }, [stores, routeStoreOrder])

  const handleDateChange = async (storeId: string, date: string) => {
    setLoading({ ...loading, [storeId]: true })
    try {
      await updateRoutePlannedDate(storeId, date || null)
      router.refresh()
    } catch (error) {
      console.error('Error updating planned date:', error)
    } finally {
      setLoading({ ...loading, [storeId]: false })
    }
  }

  const handleDeleteRoute = (storeId: string, storeName: string) => {
    setStoreToDelete({ id: storeId, name: storeName })
    setDeleteConfirmOpen(true)
  }

  const handleDeleteRouteGroup = (group: { stores: Store[] }) => {
    const storeNames = group.stores.map(s => s.store_name).join(', ')
    setStoreToDelete({ id: group.stores[0].id, name: storeNames })
    setDeleteConfirmOpen(true)
  }

  const handleRemoveStoreFromRoute = async (storeId: string) => {
    setLoading({ ...loading, [storeId]: true })
    try {
      await updateRoutePlannedDate(storeId, null)
      router.refresh()
    } catch (error) {
      console.error('Error removing store from route:', error)
      alert('Error removing store from route. Please try again.')
    } finally {
      setLoading({ ...loading, [storeId]: false })
    }
  }

  // Initialize routeStoreOrder from database route_sequence on mount
  useEffect(() => {
    const storesWithPlannedDates = stores.filter(s => s.compliance_audit_2_planned_date)
    
    if (storesWithPlannedDates.length === 0) {
      setRouteStoreOrder({})
      return
    }
    
    // Group by planned date + manager to match planned route cards.
    const grouped = storesWithPlannedDates.reduce((acc, store) => {
      const key = getPlannedRouteGroupKey(
        store.compliance_audit_2_planned_date || '',
        store.compliance_audit_2_assigned_manager_user_id
      )
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(store)
      return acc
    }, {} as Record<string, Store[]>)

    // Build routeStoreOrder from database route_sequence
    const initialOrder: Record<string, string[]> = {}
    Object.entries(grouped).forEach(([key, groupStores]) => {
      // Sort by route_sequence if available, otherwise keep original order
      const sorted = [...groupStores].sort((a, b) => {
        if (a.route_sequence !== null && b.route_sequence !== null) {
          return a.route_sequence - b.route_sequence
        }
        if (a.route_sequence !== null) return -1
        if (b.route_sequence !== null) return 1
        return 0
      })
      initialOrder[key] = sorted.map(s => s.id)
    })

    // Always update from database on mount/refresh
    setRouteStoreOrder(initialOrder)
  }, [stores])

  // Load operational items for each planned route
  useEffect(() => {
    const loadOperationalItems = async () => {
      const itemsMap: Record<string, Array<{ title: string; start_time: string }>> = {}
      
      for (const group of plannedRoutes) {
        if (!group.managerId || !group.plannedDate) continue
        
        const groupKey = (group as any)._groupKey || getPlannedRouteGroupKey(group.plannedDate, group.managerId)
        
        try {
          const { data, error } = await getRouteOperationalItems(group.managerId, group.plannedDate, group.region)
          if (!error && data) {
            itemsMap[groupKey] = data.map(item => ({ title: item.title, start_time: item.start_time }))
          }
        } catch (error) {
          console.error('Error loading operational items for route:', error)
        }
      }
      
      setRouteOperationalItems(itemsMap)
    }
    
    if (plannedRoutes.length > 0) {
      loadOperationalItems()
    }
  }, [plannedRoutes])

  const handleReorderStore = async (groupKey: string, storeId: string, direction: 'up' | 'down') => {
    const group = plannedRoutes.find((g) => {
      const key = (g as any)._groupKey || getPlannedRouteGroupKey(g.plannedDate, g.managerId)
      return key === groupKey
    })
    
    if (!group) return

    const currentOrder = routeStoreOrder[groupKey] || group.stores.map(s => s.id)
    const currentIndex = currentOrder.indexOf(storeId)
    
    if (currentIndex === -1) return
    
    if (direction === 'up' && currentIndex === 0) return
    if (direction === 'down' && currentIndex === currentOrder.length - 1) return

    const newOrder = [...currentOrder]
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    ;[newOrder[currentIndex], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[currentIndex]]

    // Update state immediately for responsive UI
    setRouteStoreOrder({
      ...routeStoreOrder,
      [groupKey]: newOrder
    })

    // Save to database
    try {
      const { updateRouteSequence } = await import('@/app/actions/route-planning')
      await updateRouteSequence(newOrder, groupKey)
      router.refresh()
    } catch (error) {
      console.error('Error saving route order:', error)
      // Revert on error
      setRouteStoreOrder({
        ...routeStoreOrder,
        [groupKey]: currentOrder
      })
      alert('Error saving route order. Please try again.')
    }

    // Update the selected route directions if it's currently open for this group
    if (selectedRouteForDirections) {
      const reorderedStores = newOrder
        .map(id => group.stores.find(s => s.id === id))
        .filter(Boolean) as Store[]
      setSelectedRouteForDirections({
        ...selectedRouteForDirections,
        stores: reorderedStores
      })
    }
  }

  const confirmDeleteRoute = async () => {
    if (!storeToDelete) return
    
    setDeleteConfirmOpen(false)
    
    try {
      // Find the route group that contains this store
      const routeGroup = plannedRoutes.find(group => 
        group.stores.some(s => s.id === storeToDelete.id)
      )
      
      if (routeGroup) {
        // Delete all stores in the group
        setLoading({ ...loading, ...Object.fromEntries(routeGroup.stores.map(s => [s.id, true])) })
        await Promise.all(
          routeGroup.stores.map(store => updateRoutePlannedDate(store.id, null))
        )
        
        // Delete all saved visit times and operational items for this route
        if (routeGroup.managerId && routeGroup.plannedDate) {
          await Promise.all([
            deleteAllRouteVisitTimes(routeGroup.managerId, routeGroup.plannedDate, routeGroup.region),
            deleteAllRouteOperationalItems(routeGroup.managerId, routeGroup.plannedDate, routeGroup.region)
          ])
        }
        
        setLoading({ ...loading, ...Object.fromEntries(routeGroup.stores.map(s => [s.id, false])) })
      } else {
        // Fallback: delete just the one store
        setLoading({ ...loading, [storeToDelete.id]: true })
        await updateRoutePlannedDate(storeToDelete.id, null)
        setLoading({ ...loading, [storeToDelete.id]: false })
      }
      
      setStoreToDelete(null)
      router.refresh()
    } catch (error) {
      console.error('Error deleting route:', error)
      setStoreToDelete(null)
    }
  }

  const handleManagerSelect = (managerId: string) => {
    setSelectedManager(managerId)
  }

  const handleStoreSelect = (storeId: string) => {
    const newSelected = new Set(selectedStores)
    if (newSelected.has(storeId)) {
      newSelected.delete(storeId)
    } else {
      newSelected.add(storeId)
    }
    setSelectedStores(newSelected)
  }

  const handleBulkDateAssign = async () => {
    if (!selectedDate || selectedStores.size === 0) return
    
    setLoading({ bulk: true })
    try {
      await Promise.all(
        Array.from(selectedStores).map(storeId =>
          updateRoutePlannedDate(storeId, selectedDate)
        )
      )
      setSelectedStores(new Set())
      router.refresh()
    } catch (error) {
      console.error('Error bulk updating dates:', error)
    } finally {
      setLoading({ bulk: false })
    }
  }

  const handleRouteAreaSelect = (area: string | null) => {
    setRouteArea(area)
    setRouteSelectedStores(new Set()) // Clear selections when area changes
    setOptimizationSummary(null)
  }

  const handleRouteStoreToggle = (storeId: string) => {
    const newSelected = new Set(routeSelectedStores)
    if (newSelected.has(storeId)) {
      newSelected.delete(storeId)
    } else {
      if (newSelected.size >= routeStopLimit) {
        alert(`Maximum ${routeStopLimit} stores per route. Please deselect a store first.`)
        return
      }
      newSelected.add(storeId)
    }
    setRouteSelectedStores(newSelected)
    setOptimizationSummary(null)
  }

  const handleOptimizeRoute = async () => {
    const targetStopCount = Math.min(routeStopLimit, storesInRouteAreaWithLocations.length)

    if (!routeManager || storesInRouteAreaWithLocations.length < 2) {
      alert('Please select a manager and ensure at least 2 stores are available for optimization.')
      return
    }

    setIsOptimizing(true)
    try {
      const manager = profiles.find(p => p.id === routeManager)
      if (!manager) {
        alert('Manager not found.')
        setIsOptimizing(false)
        return
      }

      // Get manager home location (optional - optimization can work without it)
      const managerHome = manager.home_latitude && manager.home_longitude
        ? {
            latitude: typeof manager.home_latitude === 'string' 
              ? parseFloat(manager.home_latitude) 
              : manager.home_latitude,
            longitude: typeof manager.home_longitude === 'string' 
              ? parseFloat(manager.home_longitude) 
              : manager.home_longitude,
            address: manager.home_address || 'Manager Home',
          }
        : null
      
      // If no home address, show a warning but continue
      if (!managerHome) {
        console.warn('Manager home address not set - optimization will use store-to-store distances only')
      }

      const response = await fetch('/api/ai/route-optimization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stores: storesInRouteAreaWithLocations,
          managerHome,
          constraints: {
            stopLimit: targetStopCount,
            maxDriveMinutes: maxDriveMinutes ? Number(maxDriveMinutes) : null,
            maxRouteHours: maxRouteHours ? Number(maxRouteHours) : null,
            prioritize: optimizerPriority,
            requireHomeStart,
            requireHomeEnd,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Route optimization API error:', errorData)
        throw new Error(errorData.error || 'Failed to optimize route')
      }

      const result = await response.json()
      
      if (result.storeIds && Array.isArray(result.storeIds)) {
        const validStoreIds = result.storeIds.filter((id: string) => {
          const idStr = String(id).trim()
          const found = storesInRouteAreaWithLocations.some(store => {
            const storeIdStr = String(store.id).trim()
            return storeIdStr === idStr
          })
          return found
        })
        
        if (validStoreIds.length > 0) {
          const limitedStoreIds = validStoreIds.slice(0, targetStopCount)
          const newSelectedSet = new Set<string>(limitedStoreIds)
          setRouteSelectedStores(newSelectedSet)
          
          if (result.estimate) {
            const summaryParts = [
              `${result.estimate.stopCount} stops`,
              `${result.estimate.totalDistanceMiles} mi`,
              `${result.estimate.totalDriveMinutes} mins drive`,
              `${Math.round(result.estimate.totalRouteMinutes / 60)}h total`,
            ]
            setOptimizationSummary(summaryParts.join(' • '))
          } else {
            setOptimizationSummary(`${newSelectedSet.size} optimized stop${newSelectedSet.size !== 1 ? 's' : ''} selected`)
          }

          if (Array.isArray(result.warnings) && result.warnings.length > 0) {
            alert(result.warnings.join('\\n'))
          }

          requestAnimationFrame(() => {
            setTimeout(() => {
              const firstSelected = document.querySelector(`[data-store-id="${limitedStoreIds[0]}"]`)
              if (firstSelected) {
                firstSelected.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }
            }, 100)
          })
        } else {
          alert('The optimized stores were not found in the available store list. Please try again.')
        }
      } else if (result.error) {
        alert(`Unable to optimize route: ${result.error}. Please select stores manually.`)
      } else {
        alert('Unable to get optimal route. Please select stores manually.')
      }
    } catch (error) {
      console.error('Error optimizing route:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error optimizing route: ${errorMessage}. Please try again or select stores manually.`)
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleCreateRoute = async () => {
    if (!routeManager) {
      alert('Please select a manager for the route.')
      return
    }
    if (!routeDate) {
      alert('Please select a date for the route.')
      return
    }
    if (routeSelectedStores.size === 0) {
      alert('Please select at least one store for the route.')
      return
    }
    if (routeSelectedStores.size > routeStopLimit) {
      alert(`Maximum ${routeStopLimit} stores per day. Please select ${routeStopLimit} or fewer stores.`)
      return
    }

        setIsCreatingRoute(true)
        try {
          // Update all selected stores with the manager and date
          const storeIdsArray = Array.from(routeSelectedStores)
          await Promise.all(
            storeIdsArray.map(async (storeId) => {
              // First update the manager assignment
              const { updateComplianceAudit2Tracking } = await import('@/app/actions/stores')
              await updateComplianceAudit2Tracking(storeId, routeManager, routeDate)
            })
          )
          
          // Set route sequence for all stores in the route (maintains the order they were selected)
          const routeKey = getPlannedRouteGroupKey(routeDate, routeManager || null)
          const { updateRouteSequence } = await import('@/app/actions/route-planning')
          await updateRouteSequence(storeIdsArray, routeKey)
      
      // Optimistically update the stores state to show the new route immediately
      const updatedStores = stores.map(store => {
        if (routeSelectedStores.has(store.id)) {
          return {
            ...store,
            compliance_audit_2_planned_date: routeDate,
            compliance_audit_2_assigned_manager_user_id: routeManager,
            assigned_manager: profiles.find(p => p.id === routeManager) || null
          }
        }
        return store
      })
      setStores(updatedStores)
      
      // Reset form
      setRouteManager(undefined)
      setRouteDate('')
      setRouteArea(null)
      setRouteSelectedStores(new Set())
      setOptimizationSummary(null)
      
      // Refresh the page data in the background to ensure consistency
      router.refresh()
    } catch (error) {
      console.error('Error creating route:', error)
      alert('Error creating route. Please try again.')
    } finally {
      setIsCreatingRoute(false)
    }
  }

  const availableStoreCount = storesAvailableForPlanning.length
  const plannedRouteCount = plannedRoutes.length
  const plannedStoreCount = plannedRoutes.reduce((total, route) => total + route.stores.length, 0)
  const managerCount = profiles.length
  const storesInRouteAreaMissingCoordsCount = storesInRouteArea.length - storesInRouteAreaWithLocations.length

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 sm:p-6 md:p-7 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Route Optimization
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Route Planning</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              Build daily compliance routes, optimize store selection, and track planned rounds by area and manager.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200">
            Live Planner
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
          </div>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Available Stores</p>
            <p className="mt-1 text-lg font-semibold text-white">{availableStoreCount}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Planned Routes</p>
            <p className="mt-1 text-lg font-semibold text-white">{plannedRouteCount}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Planned Stores</p>
            <p className="mt-1 text-lg font-semibold text-white">{plannedStoreCount}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Managers</p>
            <p className="mt-1 text-lg font-semibold text-white">{managerCount}</p>
          </div>
        </div>
      </div>

      {/* Create Route Section */}
      <Card className="overflow-hidden border-blue-200/80 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 shadow-sm">
        <CardHeader className="border-b border-blue-200/60 bg-white/45">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
            <Plus className="h-5 w-5" />
            Create New Route
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Home className="h-4 w-4" />
                Manager
              </label>
              <Select value={routeManager} onValueChange={setRouteManager}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Route Date
              </label>
              <Input
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                max={`${new Date().getFullYear()}-12-31`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Area
              </label>
              <Select value={routeArea || 'all'} onValueChange={(value) => handleRouteAreaSelect(value === 'all' ? null : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select area..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="all">All Areas</SelectItem>
                  {uniqueAreas.map((area) => (
                    <SelectItem key={area} value={area}>
                      {getAreaDisplayName(area)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Optimizer Constraints</p>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                used for smart suggestions
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Stop limit</label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={routeStopLimit}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 1
                    setRouteStopLimit(Math.max(1, Math.min(6, next)))
                    setOptimizationSummary(null)
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Max drive mins</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Optional"
                  value={maxDriveMinutes}
                  onChange={(e) => {
                    setMaxDriveMinutes(e.target.value)
                    setOptimizationSummary(null)
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Max route hours</label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="Optional"
                  value={maxRouteHours}
                  onChange={(e) => {
                    setMaxRouteHours(e.target.value)
                    setOptimizationSummary(null)
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Priority</label>
                <Select
                  value={optimizerPriority}
                  onValueChange={(value) => {
                    setOptimizerPriority(value as 'balanced' | 'min_drive' | 'tight_cluster')
                    setOptimizationSummary(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="min_drive">Min Drive Time</SelectItem>
                    <SelectItem value="tight_cluster">Tight Clusters</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={requireHomeStart}
                  onChange={(e) => {
                    setRequireHomeStart(e.target.checked)
                    setOptimizationSummary(null)
                  }}
                />
                Start from manager home
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={requireHomeEnd}
                  onChange={(e) => {
                    setRequireHomeEnd(e.target.checked)
                    setOptimizationSummary(null)
                  }}
                />
                Return to manager home
              </label>
            </div>
            {optimizationSummary && (
              <p className="mt-2 text-xs font-medium text-blue-700">{optimizationSummary}</p>
            )}
          </div>

          {/* Store Selection for Route */}
          {storesInRouteArea.length > 0 && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Stores in {getAreaDisplayName(routeArea)} ({storesInRouteArea.length} stores)
                  </h3>
                  {storesInRouteAreaMissingCoordsCount > 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      {storesInRouteAreaMissingCoordsCount} store{storesInRouteAreaMissingCoordsCount === 1 ? '' : 's'} missing map coordinates
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {storesInRouteAreaWithLocations.length >= 2 && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleOptimizeRoute}
                      disabled={isOptimizing}
                      className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      title={`Suggest an optimal ${Math.min(routeStopLimit, storesInRouteAreaWithLocations.length)}-stop route`}
                    >
                      {isOptimizing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Optimizing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Suggest Optimal {Math.min(routeStopLimit, storesInRouteAreaWithLocations.length)} Stores
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        routeSelectedStores.size >= routeStopLimit ||
                        routeSelectedStores.size === Math.min(routeStopLimit, storesInRouteArea.length)
                      ) {
                        setRouteSelectedStores(new Set())
                      } else {
                        const maxStores = Math.min(routeStopLimit, storesInRouteArea.length)
                        setRouteSelectedStores(new Set(storesInRouteArea.slice(0, maxStores).map(s => s.id)))
                      }
                      setOptimizationSummary(null)
                    }}
                  >
                    {routeSelectedStores.size >= routeStopLimit || (routeSelectedStores.size > 0 && routeSelectedStores.size === Math.min(routeStopLimit, storesInRouteArea.length))
                      ? 'Deselect All'
                      : `Select All (Max ${routeStopLimit})`}
                  </Button>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {storesInRouteArea.map((store) => {
                      const isSelected = routeSelectedStores.has(store.id)
                      const isDisabled = !isSelected && routeSelectedStores.size >= routeStopLimit
                      const hasCoords =
                        store.latitude !== null &&
                        store.longitude !== null &&
                        Number.isFinite(Number(store.latitude)) &&
                        Number.isFinite(Number(store.longitude))
                      return (
                        <div
                          key={store.id}
                          data-store-id={store.id}
                          onClick={() => {
                            if (isDisabled) return
                            handleRouteStoreToggle(store.id)
                          }}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            isDisabled
                              ? 'bg-slate-50 border-2 border-transparent opacity-50 cursor-not-allowed'
                              : isSelected
                              ? 'bg-blue-100 border-2 border-blue-500 cursor-pointer'
                              : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100 cursor-pointer'
                          }`}
                        >
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                      }`}>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          {store.store_name}
                          {/* Show (Revisit) flag if store has completed Audit 1 with score < 80% */}
                          {store.compliance_audit_1_date && 
                           store.compliance_audit_1_overall_pct !== null && 
                           store.compliance_audit_1_overall_pct < 80 && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                              (Revisit)
                            </span>
                          )}
                        </div>
                        {(getDisplayStoreCode(store.store_code) || store.region) && (
                          <div className="text-xs text-slate-500">
                            {getDisplayStoreCode(store.store_code) || ''}
                            {store.region ? `${getDisplayStoreCode(store.store_code) ? ' • ' : ''}${getAreaDisplayName(store.region)}` : ''}
                          </div>
                        )}
                        {!hasCoords && (
                          <div className="text-xs text-amber-700">
                            Missing map coordinates
                          </div>
                        )}
                      </div>
                      {store.compliance_audit_2_planned_date && (
                        <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          Already planned
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">
                    {routeSelectedStores.size > 0 
                      ? `${routeSelectedStores.size} store${routeSelectedStores.size > 1 ? 's' : ''} selected`
                      : 'No stores selected'}
                  </span>
                      {routeSelectedStores.size > 0 && routeSelectedStores.size < routeStopLimit && (
                        <span className="text-xs text-blue-600">
                          Tip: You can select up to {routeStopLimit} stores for this route
                        </span>
                      )}
                      {routeSelectedStores.size > routeStopLimit && (
                        <span className="text-xs text-red-600">
                          Maximum {routeStopLimit} stores per day. Please deselect some stores.
                        </span>
                      )}
                </div>
                    <Button
                      onClick={handleCreateRoute}
                      disabled={isCreatingRoute || routeSelectedStores.size === 0 || routeSelectedStores.size > routeStopLimit}
                      className="w-full"
                    >
                      {isCreatingRoute ? 'Creating Route...' : `Create Route with ${routeSelectedStores.size} Store${routeSelectedStores.size > 1 ? 's' : ''}`}
                    </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="bg-white shadow-sm border-slate-200 rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-200 bg-slate-50/60">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
            <MapPin className="h-5 w-5" />
            Store Locations Map
            <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              ({routeArea 
                ? storesWithLocations.filter(s => s.region === routeArea).length 
                : storesWithLocations.length} stores with locations)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[520px] md:h-[620px] w-full rounded-lg overflow-hidden border border-slate-200 relative" style={{ zIndex: 0 }}>
            <MapComponent
              stores={storesWithLocations}
              managerHome={routeManager ? (() => {
                const manager = profiles.find(p => p.id === routeManager)
                if (!manager || !manager.home_latitude || !manager.home_longitude) return null
                const lat = typeof manager.home_latitude === 'string' 
                  ? parseFloat(manager.home_latitude) 
                  : manager.home_latitude
                const lng = typeof manager.home_longitude === 'string' 
                  ? parseFloat(manager.home_longitude) 
                  : manager.home_longitude
                if (isNaN(lat) || isNaN(lng)) return null
                return {
                  latitude: lat,
                  longitude: lng,
                  address: manager.home_address || 'Manager Home',
                }
              })() : managerHome}
              selectedStores={routeSelectedStores}
              onStoreSelect={handleRouteStoreToggle}
              filteredArea={routeArea}
            />
          </div>
        </CardContent>
      </Card>

      {/* Planned Routes Table */}
      <Card className="bg-white shadow-sm border-slate-200 rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-200 bg-slate-50/60">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
            <Calendar className="h-5 w-5" />
            Planned Routes
            <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {plannedRouteCount} routes
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plannedRoutes.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No routes planned yet.</p>
          ) : (
            <div className="rounded-md border border-slate-200 bg-white max-w-full">
              <div className="max-h-[460px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10 border-b border-slate-200">
                    <TableRow>
                      <TableHead>Stores</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Assigned Manager</TableHead>
                      <TableHead>Planned Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plannedRoutes.map((group, groupIndex) => {
                      const groupKey = (group as any)._groupKey || getPlannedRouteGroupKey(group.plannedDate, group.managerId)
                      
                      // Get manager home location for this route
                      const routeManager = group.managerId
                      const routeManagerProfile = profiles.find(p => p.id === routeManager)
                      const routeManagerHome = routeManagerProfile && routeManagerProfile.home_latitude && routeManagerProfile.home_longitude
                        ? {
                            latitude: typeof routeManagerProfile.home_latitude === 'string' 
                              ? parseFloat(routeManagerProfile.home_latitude) 
                              : routeManagerProfile.home_latitude,
                            longitude: typeof routeManagerProfile.home_longitude === 'string' 
                              ? parseFloat(routeManagerProfile.home_longitude) 
                              : routeManagerProfile.home_longitude,
                            address: routeManagerProfile.home_address || 'Manager Home',
                          }
                        : null
                      
                      return (
                        <TableRow 
                          key={groupKey}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={(e) => {
                            // Don't trigger if clicking on buttons or input fields
                            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) {
                              return
                            }
                            // Use ordered stores if available, otherwise use group.stores
                            const orderedStores = routeStoreOrder[groupKey] 
                              ? routeStoreOrder[groupKey]
                                  .map(id => group.stores.find(s => s.id === id))
                                  .filter(Boolean) as Store[]
                              : group.stores
                            
                            setSelectedRouteForDirections({
                              stores: orderedStores,
                              managerHome: routeManagerHome,
                              managerName: group.assignedManager?.full_name || 'Unassigned',
                              plannedDate: group.plannedDate,
                              managerUserId: group.managerId,
                              region: group.region
                            })
                          }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              {group.stores.map((store, storeIndex) => {
                                const isStoreLoading = loading[store.id]
                                const isEditing = editingRouteGroup === groupKey
                                const currentOrder = routeStoreOrder[groupKey] || group.stores.map(s => s.id)
                                const orderedIndex = currentOrder.indexOf(store.id)
                                const canMoveUp = orderedIndex > 0
                                const canMoveDown = orderedIndex < group.stores.length - 1
                                
                                return (
                                  <div key={store.id} className="flex items-center gap-2">
                                    {isEditing && (
                                      <>
                                        {/* Reorder controls */}
                                        <div className="flex flex-col gap-0.5">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleReorderStore(groupKey, store.id, 'up')
                                            }}
                                            disabled={!canMoveUp}
                                            className="h-5 w-5 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                                            title="Move up"
                                          >
                                            <ChevronUp className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleReorderStore(groupKey, store.id, 'down')
                                            }}
                                            disabled={!canMoveDown}
                                            className="h-5 w-5 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                                            title="Move down"
                                          >
                                            <ChevronDown className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        {/* Remove button */}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleRemoveStoreFromRoute(store.id)
                                          }}
                                          disabled={isStoreLoading}
                                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                          title="Remove from route"
                                        >
                                          {isStoreLoading ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <X className="h-3 w-3" />
                                          )}
                                        </Button>
                                      </>
                                    )}
                                    <span>
                                      {store.store_name}
                                      {getDisplayStoreCode(store.store_code) && (
                                        <span className="text-gray-500 text-xs ml-2">({getDisplayStoreCode(store.store_code)})</span>
                                      )}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </TableCell>
                          <TableCell>{group.region ? getAreaDisplayName(group.region) : '-'}</TableCell>
                          <TableCell>
                            {group.assignedManager?.full_name || '-'}
                          </TableCell>
                          <TableCell>
                            {editingRouteGroup === groupKey ? (
                              <Input
                                type="date"
                                defaultValue={group.plannedDate || ''}
                                onBlur={async (e) => {
                                  const newDate = e.target.value
                                  if (newDate && newDate !== group.plannedDate) {
                                    setLoading({ ...loading, [group.stores[0].id]: true })
                                    try {
                                      const { updateComplianceAudit2Tracking } = await import('@/app/actions/stores')
                                      await Promise.all(
                                        group.stores.map(store => 
                                          updateComplianceAudit2Tracking(store.id, group.managerId, newDate)
                                        )
                                      )
                                      router.refresh()
                                    } catch (error) {
                                      console.error('Error updating route date:', error)
                                      alert('Error updating route date. Please try again.')
                                    } finally {
                                      setLoading({ ...loading, [group.stores[0].id]: false })
                                    }
                                  }
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    const newDate = (e.target as HTMLInputElement).value
                                    if (newDate && newDate !== group.plannedDate) {
                                      setLoading({ ...loading, [group.stores[0].id]: true })
                                      try {
                                        const { updateComplianceAudit2Tracking } = await import('@/app/actions/stores')
                                        await Promise.all(
                                          group.stores.map(store => 
                                            updateComplianceAudit2Tracking(store.id, group.managerId, newDate)
                                          )
                                        )
                                        router.refresh()
                                      } catch (error) {
                                        console.error('Error updating route date:', error)
                                        alert('Error updating route date. Please try again.')
                                      } finally {
                                        setLoading({ ...loading, [group.stores[0].id]: false })
                                      }
                                    }
                                  }
                                }}
                                className="w-40 h-8 text-sm"
                                min={new Date().toISOString().split('T')[0]}
                              />
                            ) : (
                              <span className="cursor-pointer hover:text-blue-600" onClick={() => setEditingRouteGroup(groupKey)} title="Click to edit date">
                                {group.plannedDate ? format(new Date(group.plannedDate), 'dd/MM/yyyy') : '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {routeOperationalItems[groupKey] && routeOperationalItems[groupKey].length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {routeOperationalItems[groupKey].map((item, idx) => (
                                  <div key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                                    <span className="text-purple-600 font-medium">{item.start_time}</span>
                                    <span>{item.title}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {editingRouteGroup === groupKey ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingRouteGroup(null)}
                                  className="h-8"
                                >
                                  Done
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingRouteGroup(groupKey)}
                                    className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    title="Edit route"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRouteGroup(group)}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title="Delete entire route"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Directions Modal */}
      {selectedRouteForDirections && (
        <RouteDirectionsModal
          isOpen={!!selectedRouteForDirections}
          onClose={() => setSelectedRouteForDirections(null)}
          stores={selectedRouteForDirections.stores}
          managerHome={selectedRouteForDirections.managerHome}
          managerName={selectedRouteForDirections.managerName}
          plannedDate={selectedRouteForDirections.plannedDate}
          managerUserId={selectedRouteForDirections.managerUserId}
          region={selectedRouteForDirections.region}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Planned Route?</DialogTitle>
            <DialogDescription>
              {storeToDelete && storeToDelete.name.includes(',') ? (
                <>
                  Are you sure you want to delete the entire route for <strong>{storeToDelete.name}</strong>? 
                  This will clear the planned date for all stores in this route and they will appear back in the Compliance Visits Due list.
                </>
              ) : (
                <>
                  Are you sure you want to remove the planned route for <strong>{storeToDelete?.name}</strong>? 
                  This will clear the planned date and the store will appear back in the Compliance Visits Due list.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setStoreToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteRoute}
              disabled={loading[storeToDelete?.id || '']}
            >
              {loading[storeToDelete?.id || ''] ? 'Deleting...' : 'Delete Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
