/* eslint-disable */
'use client';
import Links from './components/Links';
import { IRoute } from 'types/navigation';

function SidebarHorizon(props: {
  routes: IRoute[];
  userName?: string;
  userEmail?: string;
  [x: string]: any;
}) {
  const { routes, open, userName, userEmail } = props;
  return (
    <div
      className={
        'duration-300 linear fixed left-0 top-0 !z-50 flex h-screen flex-col overflow-hidden bg-white pb-6 shadow-2xl shadow-white/5 transition-all dark:!bg-navy-800 dark:text-white ' +
        (open ? 'w-[300px]' : 'w-[88px]')
      }
    >
      <div className="mt-[50px] flex items-center justify-center">
        {open ? (
          <div className="font-poppins text-[26px] font-bold uppercase text-navy-700 dark:text-white">
            Callora
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 font-poppins text-xl font-bold text-white">
            C
          </div>
        )}
      </div>
      <div className="mb-7 mt-[40px] h-px bg-gray-300 dark:bg-white/30" />

      <ul className="mb-auto pt-1">
        <Links routes={routes} mini={!open} />
      </ul>

      {userName ? (
        <div
          className={
            'mt-6 rounded-2xl bg-lightPrimary p-3 dark:bg-navy-900 ' +
            (open ? 'mx-5' : 'mx-2')
          }
        >
          <div className={open ? 'flex items-center gap-3' : 'flex justify-center'}>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            {open ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                  {userName}
                </p>
                {userEmail ? (
                  <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                    {userEmail}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SidebarHorizon;
