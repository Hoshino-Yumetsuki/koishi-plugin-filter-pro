import type { Context } from '@koishijs/client'
import { icons } from '@koishijs/client'
import Page from './page.vue'
import ActivityIcon from './icons/activity.vue'

export default (ctx: Context) => {
  icons.register('activity:filter-pro', ActivityIcon as any)

  ctx.page({
    name: '规则集',
    path: '/filter-pro',
    icon: 'activity:filter-pro',
    authority: 4,
    order: 320,
    component: Page as any
  })
}
