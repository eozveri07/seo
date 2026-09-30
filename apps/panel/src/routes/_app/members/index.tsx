import { createFileRoute, Navigate } from '@tanstack/react-router'
import { PencilIcon, UserMinusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useInvitationsControllerList, useInvitationsControllerRevoke } from '@/api/invitations/invitations'
import { useMembersControllerList, useMembersControllerRemove } from '@/api/members/members'
import type { MemberResponseDto, OrgRole } from '@/api/endpoints.schemas'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChangeRoleDialog } from '@/components/members/change-role-dialog'
import { InviteDialog } from '@/components/members/invite-dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { useAuth } from '@/lib/auth/auth-context'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/members/')({
  component: MembersPage,
})

const roleLabels: Record<OrgRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  analyst: 'Analist',
  client_viewer: 'Müşteri görüntüleyici',
}

function MembersPage() {
  const permissions = usePermissions()
  const { user } = useAuth()
  const [editingMember, setEditingMember] = useState<MemberResponseDto | null>(null)

  const { data, isPending, isError, refetch } = useMembersControllerList({ page: 1, limit: 200 })
  const { mutateAsync: removeMember } = useMembersControllerRemove()

  const {
    data: invitationsData,
    isPending: invitationsPending,
    isError: invitationsError,
    refetch: refetchInvitations,
  } = useInvitationsControllerList({ page: 1, limit: 200 })
  const { mutateAsync: revokeInvitation } = useInvitationsControllerRevoke()

  if (!permissions.canManageMembers) return <Navigate to="/" />

  const members = data?.status === 200 ? data.data.items : []
  const invitations = invitationsData?.status === 200 ? invitationsData.data.items : []

  async function onRemove(member: MemberResponseDto) {
    const response = await removeMember({ userId: member.userId })
    if (response.status !== 204) {
      toast.error('Üye çıkarılamadı.')
      return
    }
    toast.success('Üye çıkarıldı.')
    void refetch()
  }

  async function onRevoke(invitationId: string) {
    const response = await revokeInvitation({ id: invitationId })
    if (response.status !== 204) {
      toast.error('Davet iptal edilemedi.')
      return
    }
    toast.success('Davet iptal edildi.')
    void refetchInvitations()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Üyeler</h1>
        <InviteDialog onInvited={() => void refetchInvitations()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Üyeler</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending && <LoadingState />}
          {!isPending && isError && <ErrorState onRetry={() => refetch()} />}
          {!isPending && !isError && members.length === 0 && <EmptyState title="Henüz üye yok" />}
          {!isPending && !isError && members.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{roleLabels[member.role]}</TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Rolü değiştir"
                        onClick={() => setEditingMember(member)}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      {member.userId !== user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Üyeyi çıkar">
                              <UserMinusIcon className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Üyeyi çıkar</AlertDialogTitle>
                              <AlertDialogDescription>
                                {member.name} organizasyondan çıkarılacak.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void onRemove(member)}>Çıkar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bekleyen davetler</CardTitle>
        </CardHeader>
        <CardContent>
          {invitationsPending && <LoadingState />}
          {!invitationsPending && invitationsError && <ErrorState onRetry={() => refetchInvitations()} />}
          {!invitationsPending && !invitationsError && invitations.length === 0 && (
            <p className="text-sm text-muted-foreground">Bekleyen davet yok.</p>
          )}
          {!invitationsPending && !invitationsError && invitations.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Son geçerlilik</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{roleLabels[invitation.role]}</TableCell>
                    <TableCell>{new Date(invitation.expiresAt).toLocaleDateString('tr-TR')}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => void onRevoke(invitation.id)}>
                        İptal et
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingMember && (
        <ChangeRoleDialog
          member={editingMember}
          open={!!editingMember}
          onOpenChange={(open) => !open && setEditingMember(null)}
          onChanged={() => void refetch()}
        />
      )}
    </div>
  )
}
