#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to patch
BUMP_TYPE="${1:-patch}"

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'${NC}"
  echo "Usage: $0 [patch|minor|major]"
  echo "  patch (default) - bug fixes (0.1.1 -> 0.1.2)"
  echo "  minor           - new features (0.1.1 -> 0.2.0)"
  echo "  major           - breaking changes (0.1.1 -> 1.0.0)"
  exit 1
fi

echo -e "${BLUE}Bumping all package versions: $BUMP_TYPE${NC}"
echo ""

# Array of packages to bump
PACKAGES=("core" "compositions" "providers" "cli")

# Bump each package
for pkg in "${PACKAGES[@]}"; do
  echo -e "${GREEN}Bumping $pkg...${NC}"
  cd "$pkg"
  npm version "$BUMP_TYPE" --no-git-tag-version
  NEW_VERSION=$(node -p "require('./package.json').version")
  echo -e "  → $pkg@$NEW_VERSION"
  cd ..
done

# Get CLI version for reference
CLI_VERSION=$(node -p "require('./cli/package.json').version")

echo ""
echo -e "${GREEN}✅ All packages bumped to $BUMP_TYPE version${NC}"
echo ""
echo "Package versions:"
echo "  - tutopanda-core@$(node -p "require('./core/package.json').version")"
echo "  - tutopanda-compositions@$(node -p "require('./compositions/package.json').version")"
echo "  - tutopanda-providers@$(node -p "require('./providers/package.json').version")"
echo "  - tutopanda (CLI)@$CLI_VERSION"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review changes: ${BLUE}git diff */package.json${NC}"
echo "  2. Commit: ${BLUE}git add */package.json && git commit -m 'release: bump to $CLI_VERSION'${NC}"
echo "  3. Tag: ${BLUE}git tag cli-v$CLI_VERSION${NC}"
echo "  4. Push: ${BLUE}git push origin main cli-v$CLI_VERSION${NC}"
echo ""
echo -e "${YELLOW}Or use the automated script:${NC}"
echo "  ${BLUE}./scripts/bump-n-push.sh${NC}"
