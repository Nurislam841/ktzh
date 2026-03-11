SHELL := /bin/zsh

.PHONY: help install install-backend install-frontend db-generate db-push backend-dev frontend-dev backend-build frontend-build

help:
	@echo "KTZ local commands"
	@echo "  make install          - install backend and frontend dependencies"
	@echo "  make db-generate      - run prisma generate"
	@echo "  make db-push          - sync prisma schema to local database"
	@echo "  make backend-dev      - start NestJS backend on localhost"
	@echo "  make frontend-dev     - start Next.js frontend on localhost"
	@echo "  make backend-build    - build backend"
	@echo "  make frontend-build   - build frontend"

install: install-backend install-frontend

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

db-generate:
	cd backend && npx prisma generate

db-push:
	cd backend && npx prisma db push

backend-dev:
	cd backend && npm run start:dev

frontend-dev:
	cd frontend && npm run dev

backend-build:
	cd backend && npm run build

frontend-build:
	cd frontend && npm run build
