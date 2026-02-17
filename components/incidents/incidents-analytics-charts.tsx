'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type MonthlyTrendPoint = {
  month: string
  incidents: number
  riddor: number
  nearMiss: number
  open: number
  closed: number
}

type CategoryPoint = {
  name: string
  value: number
}

type ClaimsTrendPoint = {
  month: string
  claims: number
}

interface IncidentsAnalyticsChartsProps {
  mode?: 'overview' | 'detailed'
  monthlyData: MonthlyTrendPoint[]
  personData: CategoryPoint[]
  rootCauseData: CategoryPoint[]
  accidentTypeData: CategoryPoint[]
  claimsMonthlyData: ClaimsTrendPoint[]
}

const PIE_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#64748b', '#ef4444', '#8b5cf6']

export function IncidentsAnalyticsCharts({
  mode = 'detailed',
  monthlyData,
  personData,
  rootCauseData,
  accidentTypeData,
  claimsMonthlyData,
}: IncidentsAnalyticsChartsProps) {
  if (monthlyData.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-12 text-center text-sm text-slate-500">
          No trend data available for the selected filters.
        </CardContent>
      </Card>
    )
  }

  if (mode === 'overview') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-800">Accident Summary (Monthly)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="incidents" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Incidents" />
                  <Line type="monotone" dataKey="riddor" stroke="#dc2626" strokeWidth={2} dot={false} name="RIDDOR" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-800">Persons Affected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={personData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} name="Incidents" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-800">Trend: Accidents, RIDDOR & Near Miss</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incidents" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Incidents" />
                <Line type="monotone" dataKey="riddor" stroke="#dc2626" strokeWidth={2} dot={false} name="RIDDOR" />
                <Line type="monotone" dataKey="nearMiss" stroke="#16a34a" strokeWidth={2} dot={false} name="Near Miss" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-800">Status Trend: Open vs Closed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="open" stackId="status" fill="#2563eb" name="Open" radius={[3, 3, 0, 0]} />
                <Bar dataKey="closed" stackId="status" fill="#0f766e" name="Closed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-800">Top Root Causes</CardTitle>
        </CardHeader>
        <CardContent>
          {rootCauseData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No root cause data available.</p>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie data={rootCauseData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={45}>
                    {rootCauseData.map((entry, index) => (
                      <Cell key={`root-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-800">Accident Type Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {accidentTypeData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No accident type data available.</p>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accidentTypeData.slice(0, 8)} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-800">Claims Intake Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {claimsMonthlyData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No claims trend data available.</p>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={claimsMonthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="claims" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Claims" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

