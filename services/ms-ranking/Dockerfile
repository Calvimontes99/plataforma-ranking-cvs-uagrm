FROM php:8.3-cli-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libcurl4-openssl-dev libzip-dev libxml2-dev libonig-dev \
    && docker-php-ext-install -j"$(nproc)" bcmath curl mbstring pcntl sockets zip \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www
COPY services/ms-ranking/composer.json ./
RUN composer install --no-interaction --prefer-dist --no-scripts
COPY services/ms-ranking/ .
RUN composer dump-autoload --optimize --no-scripts

FROM php:8.3-cli-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libcurl4-openssl-dev libzip-dev libxml2-dev libonig-dev \
    && docker-php-ext-install bcmath curl mbstring pcntl sockets zip \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system laravel && useradd --system --gid laravel --create-home laravel
WORKDIR /var/www
COPY --from=build --chown=laravel:laravel /var/www /var/www
RUN mkdir -p storage/framework/cache/data storage/framework/sessions \
    storage/framework/views storage/logs bootstrap/cache \
    && chown -R laravel:laravel storage bootstrap/cache
USER laravel:laravel
EXPOSE 8000
CMD ["sh", "-c", "php artisan ranking:ensure-tables && (php artisan ranking:consume-saga &) && (php artisan ranking:publish-outbox --loop &) && exec php artisan serve --host=0.0.0.0 --port=8000"]
