# M6 Lite Control Web

Браузерный интерфейс для настройки MMStudio M6 Lite+ через WebHID.

## Запуск

Требуется Node.js 20+, Chrome или Edge.

```powershell
npm start
```

Откройте `http://localhost:4173`, нажмите «Подключить клавиатуру» и выберите M6 Lite+ в системном диалоге. WebHID работает только в HTTPS или на localhost.

Вся работа с клавиатурой выполняется напрямую из браузера через WebHID: профили M1/M2 и HE JSON, точки срабатывания, программирование клавиш (Remap, Media, HotKey, Modify, Layer, DKS, Snap Tap/SOCD), быстрые пресеты, калибровка, настройки производительности и подсветка Back/Under/Single с чтением после записи.

Node.js здесь нужен только для раздачи статических файлов в режиме разработки. HID-сервис или локальный Node-бэкенд не запускаются. Системный EQ удалён из веб-версии.

## Деплой через nginx

На сервере Node.js не нужен: опубликованная папка `web/` уже содержит собранный браузерный bundle. Скопируйте репозиторий и статические файлы:

```bash
sudo mkdir -p /opt/m6-lite-control-web /var/www/m6-lite-control
sudo git clone https://github.com/fxckthiswrld/M6-Lite-Control-Web.git /opt/m6-lite-control-web
sudo rsync -a --delete \
  --exclude='server.mjs' \
  --exclude='*.test.mjs' \
  /opt/m6-lite-control-web/web/ /var/www/m6-lite-control/
sudo chmod -R a+rX /var/www/m6-lite-control
```

Добавьте блок из [`deploy/nginx-hub.flyingmetaspace.cc.conf`](deploy/nginx-hub.flyingmetaspace.cc.conf) в `/opt/remnawave/nginx.conf`, затем проверьте и перечитайте nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

После этого откройте `https://hub.flyingmetaspace.cc`. WebHID работает на этом домене через HTTPS; при первом запуске нажмите `Connect keyboard` и выберите интерфейс M6 Lite+.

Для обновления:

```bash
cd /opt/m6-lite-control-web
sudo git pull --ff-only origin main
sudo rsync -a --delete --exclude='server.mjs' --exclude='*.test.mjs' web/ /var/www/m6-lite-control/
sudo chmod -R a+rX /var/www/m6-lite-control
```
