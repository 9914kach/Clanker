import { NavLink } from "react-router-dom";
import { ModeToggle } from "@/components/mode-toggle";
import { toolsNav } from "@/config/toolsNav";

export function TopNav() {
  return (
    <header className="app-topnav">
      <div className="app-topnav__inner">
        <NavLink
          to="/"
          className={({ isActive }) =>
            isActive ? "app-topnav__brand is-active" : "app-topnav__brand"
          }
          end
        >
          Dev tools
        </NavLink>
        <nav className="app-topnav__links" aria-label="Verktyg">
          {toolsNav.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end ?? false}
              className={({ isActive }) =>
                isActive ? "app-topnav__link is-active" : "app-topnav__link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
