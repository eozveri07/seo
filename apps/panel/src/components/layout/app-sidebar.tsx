import { SidebarNav } from './sidebar-nav'

export function AppSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4 font-semibold">SEO Platform</div>
      <SidebarNav />
    </aside>
  )
}
