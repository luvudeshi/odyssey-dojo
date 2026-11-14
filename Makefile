.PHONY: setup dev lint test check

setup:
	npm install

dev:
	npm run dev

lint:
	npm run lint && npm run typecheck

test:
	npm test && npm run build

check: lint test
