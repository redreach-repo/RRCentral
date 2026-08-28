import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Seo from '../site/components/Seo'
import { ShopProvider } from './ShopContext'
import CartDrawer from './components/CartDrawer'
import ShopFooter from './components/ShopFooter'
import ShopHeader from './components/ShopHeader'
import './shop.css'

export default function ShopLayout() {
  useEffect(() => {
    document.documentElement.classList.add('tt-shop-active')
    return () => document.documentElement.classList.remove('tt-shop-active')
  }, [])

  return (
    <ShopProvider>
      <Seo
        title="Tee Tribe | Christian, one-liner and minimalist tees"
        description="Shop Tee Tribe — Christian tees, one-liners, minimalist marks and secular city shirts. UAE delivery. Pay with Stripe."
        path="/shop"
      />
      <div className="tt-root">
        <div className="tt-promo">Free UAE delivery over AED 150 · Easy returns · Pay securely with Stripe</div>
        <ShopHeader />
        <Outlet />
        <ShopFooter />
        <CartDrawer />
      </div>
    </ShopProvider>
  )
}
