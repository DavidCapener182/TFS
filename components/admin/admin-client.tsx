'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, RefreshCw, UserPlus, Mail, Trash2 } from 'lucide-react'
import { getAllUsers, updateUserRole, inviteUserByEmail, deleteUser, UserWithProfile } from '@/app/actions/users'
import { UserRole } from '@/lib/auth'

export function AdminClient() {
  const [users, setUsers] = useState<UserWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roleChanges, setRoleChanges] = useState<Map<string, UserRole>>(new Map())
  
  // Invite user state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('pending')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  
  // Separate pending users from approved users
  const pendingUsers = users.filter(u => u.role === 'pending')
  const approvedUsers = users.filter(u => u.role !== 'pending')

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAllUsers()
      setUsers(data)
      setRoleChanges(new Map()) // Clear any unsaved changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    // If changing back to original role, remove from changes
    if (newRole === user.role) {
      const newChanges = new Map(roleChanges)
      newChanges.delete(userId)
      setRoleChanges(newChanges)
    } else {
      // Add to changes map
      const newChanges = new Map(roleChanges)
      newChanges.set(userId, newRole)
      setRoleChanges(newChanges)
    }
  }

  const handleSaveRole = async (userId: string) => {
    const newRole = roleChanges.get(userId)
    if (!newRole) return

    setSaving(userId)
    setError(null)
    try {
      await updateUserRole(userId, newRole)
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId ? { ...user, role: newRole } : user
        )
      )
      
      // Remove from changes map
      const newChanges = new Map(roleChanges)
      newChanges.delete(userId)
      setRoleChanges(newChanges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
      console.error('Error updating role:', err)
    } finally {
      setSaving(null)
    }
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviting(true)
    setError(null)
    setInviteSuccess(null)
    try {
      const result = await inviteUserByEmail(inviteEmail.trim(), inviteRole)
      if (result.success) {
        setInviteSuccess(result.message || 'User invited successfully')
        setInviteEmail('')
        setInviteRole('pending')
        // Reload users to show the new invite
        await loadUsers()
      } else {
        setError(result.message || 'Failed to invite user')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user')
      console.error('Error inviting user:', err)
    } finally {
      setInviting(false)
    }
  }

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to permanently delete user "${userEmail}"? This action cannot be undone and will remove all their data from the system.`)) {
      return
    }

    setDeletingUser(userId)
    setError(null)
    try {
      const result = await deleteUser(userId)
      if (result.success) {
        // Reload users to reflect the deletion
        await loadUsers()
        setInviteSuccess(result.message || 'User deleted successfully')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
      console.error('Error deleting user:', err)
    } finally {
      setDeletingUser(null)
    }
  }

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'ops':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'readonly':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'client':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRoleDescription = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Full access including admin page'
      case 'ops':
        return 'Can add and see everything'
      case 'readonly':
        return 'Can add and see everything'
      case 'client':
        return 'KSS x Footasylum - Limited read-only access'
      case 'pending':
        return 'Awaiting admin approval - no access'
      default:
        return ''
    }
  }

  const formatLastLoggedIn = (value: string | null) => {
    if (!value) return 'Never'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-muted-foreground">Loading users...</span>
        </CardContent>
      </Card>
    )
  }

  if (error && users.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadUsers} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {inviteSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
          {inviteSuccess}
        </div>
      )}

      {/* Invite User Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite New User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={inviting}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Initial Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as UserRole)}
                  disabled={inviting}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending (Requires Approval)</SelectItem>
                    <SelectItem value="ops">Ops</SelectItem>
                    <SelectItem value="readonly">Readonly</SelectItem>
                    <SelectItem value="client">Client (KSS x Footasylum)</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="w-full sm:w-auto"
            >
              {inviting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Invitation...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              The user will receive an email invitation to set their password and access the system.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Pending Users Section */}
      {pendingUsers.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-yellow-900">Pending Approval ({pendingUsers.length})</CardTitle>
                <p className="text-sm text-yellow-700 mt-1">
                  These users need admin approval before they can access the system
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {pendingUsers.map((user) => {
                const pendingRole = roleChanges.get(user.id)
                const displayRole = pendingRole || user.role
                const hasChanges = roleChanges.has(user.id) && pendingRole !== 'pending'

                return (
                  <div key={user.id} className="rounded-lg border border-yellow-200 bg-white p-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-yellow-700">Pending User</p>
                      <p className="text-sm font-medium break-all">{user.email}</p>
                      <p className="text-sm text-muted-foreground">{user.full_name || 'No name provided'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`pending-role-${user.id}`} className="text-xs text-muted-foreground">
                        Assign role
                      </Label>
                      <Select
                        value={displayRole}
                        onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                        disabled={saving === user.id}
                      >
                        <SelectTrigger id={`pending-role-${user.id}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="ops">Ops</SelectItem>
                          <SelectItem value="readonly">Readonly</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      {hasChanges ? (
                        <Button
                          onClick={() => handleSaveRole(user.id)}
                          disabled={saving === user.id}
                          size="sm"
                          variant="default"
                          className="w-full"
                        >
                          {saving === user.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Approve
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Select role to approve</span>
                      )}
                      <Button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={deletingUser === user.id || saving === user.id}
                        size="sm"
                        variant="outline"
                        className="w-full border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete user"
                      >
                        {deletingUser === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete user
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden md:block rounded-md border border-yellow-200 overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Change Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((user) => {
                    const pendingRole = roleChanges.get(user.id)
                    const displayRole = pendingRole || user.role
                    const hasChanges = roleChanges.has(user.id) && pendingRole !== 'pending'

                    return (
                      <TableRow key={user.id} className="bg-yellow-50/50">
                        <TableCell className="font-medium break-all">{user.email}</TableCell>
                        <TableCell>{user.full_name || '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={displayRole}
                            onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                            disabled={saving === user.id}
                          >
                            <SelectTrigger className="w-full min-w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="ops">Ops</SelectItem>
                              <SelectItem value="readonly">Readonly</SelectItem>
                              <SelectItem value="client">Client</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {hasChanges ? (
                              <Button
                                onClick={() => handleSaveRole(user.id)}
                                disabled={saving === user.id}
                                size="sm"
                                variant="default"
                              >
                                {saving === user.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Approve
                                  </>
                                )}
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">Select role to approve</span>
                            )}
                            <Button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              disabled={deletingUser === user.id || saving === user.id}
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete user"
                            >
                              {deletingUser === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Users ({users.length})</CardTitle>
            <Button onClick={loadUsers} variant="outline" size="sm" className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {users.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No users found
              </div>
            ) : (
              users.map((user) => {
                const pendingRole = roleChanges.get(user.id)
                const displayRole = pendingRole || user.role
                const hasChanges = roleChanges.has(user.id)

                return (
                  <div key={user.id} className="rounded-lg border bg-white p-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium break-all">{user.email}</p>
                      <p className="text-sm text-muted-foreground">{user.full_name || 'No name provided'}</p>
                      <p className="text-xs text-muted-foreground">
                        Last logged in: {formatLastLoggedIn(user.last_sign_in_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                        {user.role}
                      </Badge>
                      {pendingRole && (
                        <span className="text-xs text-muted-foreground">
                          Pending change to {pendingRole}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`all-role-${user.id}`} className="text-xs text-muted-foreground">
                        Change role
                      </Label>
                      <Select
                        value={displayRole}
                        onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                        disabled={saving === user.id}
                      >
                        <SelectTrigger id={`all-role-${user.id}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="ops">Ops</SelectItem>
                          <SelectItem value="readonly">Readonly</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      {hasChanges ? (
                        <Button
                          onClick={() => handleSaveRole(user.id)}
                          disabled={saving === user.id}
                          size="sm"
                          variant="default"
                          className="w-full"
                        >
                          {saving === user.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No changes</span>
                      )}
                      <Button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={deletingUser === user.id || saving === user.id}
                        size="sm"
                        variant="outline"
                        className="w-full border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete user"
                      >
                        {deletingUser === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete user
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className="hidden md:block rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Last Logged In</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const pendingRole = roleChanges.get(user.id)
                    const displayRole = pendingRole || user.role
                    const hasChanges = roleChanges.has(user.id)

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium break-all">{user.email}</TableCell>
                        <TableCell>{user.full_name || '—'}</TableCell>
                        <TableCell>{formatLastLoggedIn(user.last_sign_in_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                            {user.role}
                          </Badge>
                          {pendingRole && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              → {pendingRole}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={displayRole}
                            onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                            disabled={saving === user.id}
                          >
                            <SelectTrigger className="w-full min-w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="ops">Ops</SelectItem>
                              <SelectItem value="readonly">Readonly</SelectItem>
                              <SelectItem value="client">Client</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {hasChanges ? (
                              <Button
                                onClick={() => handleSaveRole(user.id)}
                                disabled={saving === user.id}
                                size="sm"
                                variant="default"
                              >
                                {saving === user.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save
                                  </>
                                )}
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">No changes</span>
                            )}
                            <Button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              disabled={deletingUser === user.id || saving === user.id}
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete user"
                            >
                              {deletingUser === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role Descriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 mr-2">
                Admin
              </Badge>
              <span className="text-muted-foreground">
                Full access to all features including this admin page. Only david.capener@kssnwltd.co.uk should have this role.
              </span>
            </div>
            <div>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 mr-2">
                Ops
              </Badge>
              <span className="text-muted-foreground">
                Can add and see everything. Standard access for internal team members.
              </span>
            </div>
            <div>
              <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200 mr-2">
                Readonly
              </Badge>
              <span className="text-muted-foreground">
                Can add and see everything. Default role for new users.
              </span>
            </div>
            <div>
              <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 mr-2">
                Client
              </Badge>
              <span className="text-muted-foreground">
                KSS x Footasylum - Limited read-only access. Can only view incidents, actions, audits, and stores. Cannot access route planning or activity logs.
              </span>
            </div>
            <div>
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 mr-2">
                Pending
              </Badge>
              <span className="text-muted-foreground">
                New users awaiting admin approval. Cannot access the system until approved and assigned a role.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
