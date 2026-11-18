import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, House, MapPin, ShoppingBag, User } from 'lucide-react';

function Tab({ to, label, icon: Icon }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={isActive ? 'ui-bottomNavLink ui-bottomNavLink--active' : 'ui-bottomNavLink'}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
    >
      <Icon size={22} />
      <span className="ui-bottomNavLabel">{label}</span>
    </button>
  );
}

export function BottomNav() {
  return (
    <nav className="ui-bottomNav" aria-label="Навигация">
      <div className="ui-bottomNavInner">
        <Tab to="/" label="Главная" icon={House} />
        <Tab to="/favorites" label="Сохранено" icon={Heart} />
        <Tab to="/catalog" label="Каталог" icon={ShoppingBag} />
        <Tab to="/recipients" label="Адреса" icon={MapPin} />
        <Tab to="/account" label="Профиль" icon={User} />
      </div>
    </nav>
  );
}
