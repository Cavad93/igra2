# assets/

Визуальные ресурсы игры. Все изображения — CC0 / Public Domain, пригодны для коммерческого использования.

## Структура

```
assets/
├── portraits/          # Портреты персонажей (JPG, не в git)
│   ├── greek/          # Фаюмские портреты (Met Museum CC0)
│   ├── roman/          # Фаюмские портреты (Met Museum CC0)
│   ├── carthaginian/
│   ├── egyptian/
│   ├── persian/
│   ├── celtic/
│   ├── indian/
│   ├── east_asian/
│   ├── nomadic/
│   └── placeholder.svg # SVG-заглушка (в git)
├── textures/           # Фоновые текстуры панелей (JPG, не в git)
├── backgrounds/        # Splash-экраны (JPG, не в git)
├── icons/              # Векторные иконки наций и UI (SVG, в git)
├── manifest.json       # Реестр всех ассетов с источниками
└── download.sh         # Скрипт загрузки JPG-файлов
```

## Загрузка файлов

JPG-файлы не хранятся в git (слишком тяжёлые). Скачать все:

```bash
bash assets/download.sh
```

## Лицензии

| Источник | Лицензия | Использование |
|----------|----------|---------------|
| The Metropolitan Museum of Art | CC0 1.0 | Любое, включая коммерческое |
| Wikimedia Commons (Public Domain) | Public Domain | Любое, включая коммерческое |

### Фаюмские портреты (Met Museum)

- Object 547860 — «Молодая женщина» https://www.metmuseum.org/art/collection/search/547860
- Object 547856 — «Бородатый мужчина» https://www.metmuseum.org/art/collection/search/547856
- Object 547858 — «Мужчина» https://www.metmuseum.org/art/collection/search/547858
- Object 547861 — «Женщина с венком» https://www.metmuseum.org/art/collection/search/547861
- Object 547768 — «Молодой римлянин» https://www.metmuseum.org/art/collection/search/547768
- Object 547697 — «Юноша» https://www.metmuseum.org/art/collection/search/547697

### Фоны (Wikimedia Commons)

- Помпейская фреска — Public Domain
- Мозаика Александра — Public Domain
