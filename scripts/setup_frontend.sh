#!/bin/bash
# run from trading-agent/ root

set -e

cd "$(dirname "$0")"

# scaffold next app
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"

cd frontend

# install dependencies
npm install \
  @tanstack/react-query \
  @tanstack/react-query-devtools \
  axios \
  recharts \
  date-fns \
  lucide-react \
  clsx \
  tailwind-merge \
  @radix-ui/react-dialog \
  @radix-ui/react-badge \
  @radix-ui/react-separator \
  @radix-ui/react-tooltip \
  socket.io-client

# shadcn init
npx shadcn@latest init -y -d

# add shadcn components we need
npx shadcn@latest add badge button card dialog separator table tabs tooltip

echo "✅ Frontend scaffolded"