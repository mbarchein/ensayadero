import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { enablePush } from '../../lib/push'
import { Button } from '../../components/ui'

export default function ProfilePage() {
  const { profile, signOut } = useAuth()
  const [pushState, setPushState] = useState<'idle' | 'ok' | 'fail'>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'ok' : 'idle',
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Perfil</h1>
      <div className="flex items-center gap-4 rounded-xl border bg-white p-4">
        {profile?.avatar_url && <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full" />}
        <div>
          <p className="font-medium">{profile?.name}</p>
          <p className="text-sm text-gray-500">{profile?.email}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">Notificaciones push</h2>
        <p className="mb-3 text-sm text-gray-600">
          Recibe avisos de ensayos confirmados, cambios y cancelaciones en este dispositivo.
        </p>
        {pushState === 'ok' ? (
          <p className="text-sm font-medium text-green-700">✓ Activadas en este dispositivo</p>
        ) : (
          <Button onClick={async () => setPushState((await enablePush()) ? 'ok' : 'fail')}>
            Activar notificaciones
          </Button>
        )}
        {pushState === 'fail' && (
          <p className="mt-2 text-sm text-red-600">
            No se pudo activar. Revisa permisos del navegador o instala la app (iOS requiere instalarla).
          </p>
        )}
      </section>

      <Button variant="secondary" onClick={signOut} className="w-full">
        Cerrar sesión
      </Button>
    </div>
  )
}
