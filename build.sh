set -e

# Clean previous builds
rm -rf ./dist

# Compile TypeScript
npx tsc

# Copy non-TypeScript files over to ./dist
## Package file
cp ./package.json ./dist
cp ./package-lock.json ./dist
## README
cp ./README.md ./dist

# Return to the root directory
cd ..