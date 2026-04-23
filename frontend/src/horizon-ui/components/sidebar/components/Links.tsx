/* eslint-disable */
import React from 'react';
import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import NavLink from 'components/link/NavLink';
import DashIcon from 'components/icons/DashIcon';

type RouteItem = {
  name: string;
  layout?: string;
  path: string;
  icon?: React.ReactNode;
  secondary?: boolean;
};

export const SidebarLinks = (props: {
  routes: RouteItem[];
  mini?: boolean;
}): JSX.Element => {
  const pathname = usePathname();
  const { routes, mini } = props;

  const activeRoute = useCallback(
    (routePath: string) => {
      if (!pathname) return false;
      return pathname === routePath || pathname.startsWith(routePath + '/');
    },
    [pathname],
  );

  const createLinks = (routes: RouteItem[]) => {
    return routes.map((route, index) => {
      const href = (route.layout || '') + route.path;
      const active = activeRoute(href);
      return (
        <NavLink key={index} href={href}>
          <div
            className={
              'relative mb-3 flex hover:cursor-pointer ' +
              (mini ? 'justify-center' : '')
            }
            title={mini ? route.name : undefined}
          >
            <li
              className={
                'my-[3px] flex cursor-pointer items-center transition-colors ' +
                (mini
                  ? 'h-10 w-10 justify-center rounded-xl ' +
                    (active
                      ? 'bg-brand-500 text-white dark:bg-brand-400'
                      : 'hover:bg-lightPrimary dark:hover:bg-navy-900')
                  : 'px-8')
              }
            >
              <span
                className={
                  mini && active
                    ? 'font-bold text-white'
                    : active
                    ? 'font-bold text-brand-500 dark:text-white'
                    : 'font-medium text-gray-600'
                }
              >
                {route.icon ? route.icon : <DashIcon />}
              </span>
              {mini ? null : (
                <p
                  className={
                    'leading-1 ml-4 flex ' +
                    (active
                      ? 'font-bold text-navy-700 dark:text-white'
                      : 'font-medium text-gray-600')
                  }
                >
                  {route.name}
                </p>
              )}
            </li>
            {active && !mini ? (
              <div className="absolute right-0 top-px h-9 w-1 rounded-lg bg-brand-500 dark:bg-brand-400" />
            ) : null}
          </div>
        </NavLink>
      );
    });
  };

  return <>{createLinks(routes)}</>;
};

export default SidebarLinks;
