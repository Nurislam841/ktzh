export type PassengerRouteType = 'talgo' | 'standard' | 'private_standard';

export type PassengerRouteConfig = {
  key: string;
  displayPair: string;
  routeLabel: string;
  routeType: PassengerRouteType;
  routeTypeLabel: string;
  origin: string;
  destination: string;
  carrier: 'КТЖ';
};

function normalizePairKey(pair: string) {
  const [leftRaw, rightRaw] = pair.split('/');
  const left = leftRaw.trim().replace(/\D+/g, '');
  const right = rightRaw.trim().replace(/\D+/g, '');
  const ordered = [left, right].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  return `${ordered[0].padStart(3, '0')}/${ordered[1].padStart(3, '0')}`;
}

function routeConfig(
  displayPair: string,
  routeLabel: string,
  routeType: PassengerRouteType,
  routeTypeLabel: string,
  origin: string,
  destination: string,
): PassengerRouteConfig {
  return {
    key: normalizePairKey(displayPair),
    displayPair,
    routeLabel,
    routeType,
    routeTypeLabel,
    origin,
    destination,
    carrier: 'КТЖ',
  };
}

export const PASSENGER_ROUTE_CONFIG: PassengerRouteConfig[] = [
  routeConfig('3/4', 'Нурлы жол – Алматы-2', 'talgo', 'Тальго', 'Нурлы жол', 'Алматы-2'),
  routeConfig('9/10', 'Астана-1 – Алматы-2', 'talgo', 'Тальго', 'Астана-1', 'Алматы-2'),
  routeConfig('11/12', 'Алматы-2 – Шымкент', 'talgo', 'Тальго', 'Алматы-2', 'Шымкент'),
  routeConfig('25/26', 'Алматы-2 – Шымкент', 'talgo', 'Тальго', 'Алматы-2', 'Шымкент'),
  routeConfig('66/65', 'Нурлы жол – Кызылорда', 'talgo', 'Тальго', 'Нурлы жол', 'Кызылорда'),
  routeConfig('67/68', 'Нурлы жол – Оскемен-1', 'talgo', 'Тальго', 'Нурлы жол', 'Оскемен-1'),
  routeConfig('71/72', 'Нур-Султан НЖ – Шымкент', 'talgo', 'Тальго', 'Нур-Султан НЖ', 'Шымкент'),
  routeConfig('81/82', 'Нурлы жол – Орал', 'talgo', 'Тальго', 'Нурлы жол', 'Орал'),
  routeConfig('85/86', 'Нурлы жол – Шымкент', 'talgo', 'Тальго', 'Нурлы жол', 'Шымкент'),
  routeConfig('105/106', 'Алматы-2 – Петропавловск', 'talgo', 'Тальго', 'Алматы-2', 'Петропавловск'),
  routeConfig('119/120', 'Алматы-2 – Костанай', 'talgo', 'Тальго', 'Алматы-2', 'Костанай'),
  routeConfig('27/28', 'Алматы-2 – Уральск', 'talgo', 'Тальго', 'Алматы-2', 'Уральск'),

  routeConfig('21/22', 'Кызылорда – Семей', 'standard', 'Стандартные', 'Кызылорда', 'Семей'),
  routeConfig('23/24', 'Актобе – Алматы-1', 'standard', 'Стандартные', 'Актобе', 'Алматы-1'),
  routeConfig('31/32', 'Павлодар – Алматы-2', 'standard', 'Стандартные', 'Павлодар', 'Алматы-2'),
  routeConfig('33/34', 'Актобе – Алматы-1', 'standard', 'Стандартные', 'Актобе', 'Алматы-1'),
  routeConfig('37/38', 'Мангистау – Семей', 'standard', 'Стандартные', 'Мангистау', 'Семей'),
  routeConfig('41/42', 'Атырау – Алматы-1', 'standard', 'Стандартные', 'Атырау', 'Алматы-1'),
  routeConfig('45/46', 'Павлодар – Туркестан', 'standard', 'Стандартные', 'Павлодар', 'Туркестан'),
  routeConfig('47/48', 'Атырау – Нурлы жол', 'standard', 'Стандартные', 'Атырау', 'Нурлы жол'),
  routeConfig('73/74', 'Алматы-2 – Жезказган', 'standard', 'Стандартные', 'Алматы-2', 'Жезказган'),
  routeConfig('77/78', 'Алматы-2 – Мангистау', 'standard', 'Стандартные', 'Алматы-2', 'Мангистау'),
  routeConfig('88/87', 'Алматы-2 – Сарыагаш', 'standard', 'Стандартные', 'Алматы-2', 'Сарыагаш'),
  routeConfig('139/140', 'Павлодар – Пресногорьковская', 'standard', 'Стандартные', 'Павлодар', 'Пресногорьковская'),
  routeConfig('313/314', 'Мангистау – Атырау', 'standard', 'Стандартные', 'Мангистау', 'Атырау'),
  routeConfig('692/691', 'Актобе – Атырау', 'standard', 'Стандартные', 'Актобе', 'Атырау'),
  routeConfig('351/352', 'Алматы-2 – Оскемен-1', 'standard', 'Стандартные', 'Алматы-2', 'Оскемен-1'),

  routeConfig('15/16', 'Алматы – Петропавловск', 'private_standard', 'Частные стандартные', 'Алматы', 'Петропавловск'),
  routeConfig('43/44', 'Костанай – Алматы', 'private_standard', 'Частные стандартные', 'Костанай', 'Алматы'),
  routeConfig('57/58', 'Уральск – Нур-Султан НЖ', 'private_standard', 'Частные стандартные', 'Уральск', 'Нур-Султан НЖ'),
  routeConfig('76/75', 'Кызылорда – Петропавловск', 'private_standard', 'Частные стандартные', 'Кызылорда', 'Петропавловск'),
  routeConfig('107/108', 'Жезказган – Нур-Султан НЖ', 'private_standard', 'Частные стандартные', 'Жезказган', 'Нур-Султан НЖ'),
  routeConfig('117/118', 'Кызылорда – Павлодар', 'private_standard', 'Частные стандартные', 'Кызылорда', 'Павлодар'),
  routeConfig('122/121', 'Нур-Султан НЖ – Семей', 'private_standard', 'Частные стандартные', 'Нур-Султан НЖ', 'Семей'),
  routeConfig('327/328', 'Костанай – Караганды', 'private_standard', 'Частные стандартные', 'Костанай', 'Караганды'),
];

export const PASSENGER_ROUTE_CONFIG_BY_KEY = new Map(
  PASSENGER_ROUTE_CONFIG.map((item) => [item.key, item]),
);
