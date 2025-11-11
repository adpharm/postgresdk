#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command-line arguments
NON_INTERACTIVE=false
VERSION_TYPE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --patch)
            NON_INTERACTIVE=true
            VERSION_TYPE="patch"
            shift
            ;;
        --minor)
            NON_INTERACTIVE=true
            VERSION_TYPE="minor"
            shift
            ;;
        --major)
            NON_INTERACTIVE=true
            VERSION_TYPE="major"
            shift
            ;;
        --help|-h)
            echo "Usage: ./publish.sh [--patch|--minor|--major]"
            echo ""
            echo "Options:"
            echo "  --patch    Bump patch version (0.1.0 → 0.1.1) - non-interactive"
            echo "  --minor    Bump minor version (0.1.0 → 0.2.0) - non-interactive"
            echo "  --major    Bump major version (0.1.0 → 1.0.0) - non-interactive"
            echo "  --help     Show this help message"
            echo ""
            echo "Without flags, the script runs in interactive mode."
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}📦 postgresdk - Publish Script${NC}"
if [ "$NON_INTERACTIVE" = true ]; then
    echo -e "${YELLOW}(Non-interactive mode: ${VERSION_TYPE})${NC}"
fi
echo

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Run this script from the project root.${NC}"
    exit 1
fi

# Check if logged into npm
npm whoami &>/dev/null || {
    echo -e "${RED}❌ Error: Not logged into npm. Run 'npm login' first.${NC}"
    exit 1
}

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}\n"

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    if [ "$NON_INTERACTIVE" = true ]; then
        echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes (continuing in non-interactive mode)${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
        read -p "Do you want to continue? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Aborted.${NC}"
            exit 1
        fi
    fi
fi

# Determine version bump type
if [ "$NON_INTERACTIVE" = true ]; then
    # Version type already set from command-line flag
    case $VERSION_TYPE in
        patch)
            NEW_VERSION=$(npm version patch --no-git-tag-version | sed 's/v//')
            ;;
        minor)
            NEW_VERSION=$(npm version minor --no-git-tag-version | sed 's/v//')
            ;;
        major)
            NEW_VERSION=$(npm version major --no-git-tag-version | sed 's/v//')
            ;;
    esac
else
    # Interactive mode - ask for version bump type
    echo "How would you like to bump the version?"
    echo "  1) Patch (0.1.0 → 0.1.1)"
    echo "  2) Minor (0.1.0 → 0.2.0)"
    echo "  3) Major (0.1.0 → 1.0.0)"
    echo "  4) Prerelease (0.1.0 → 0.1.1-alpha.0)"
    echo "  5) Custom version"
    echo "  6) Don't bump (use current version)"
    echo

    read -p "Select option (1-6): " VERSION_CHOICE

    case $VERSION_CHOICE in
        1)
            VERSION_TYPE="patch"
            NEW_VERSION=$(npm version patch --no-git-tag-version | sed 's/v//')
            ;;
        2)
            VERSION_TYPE="minor"
            NEW_VERSION=$(npm version minor --no-git-tag-version | sed 's/v//')
            ;;
        3)
            VERSION_TYPE="major"
            NEW_VERSION=$(npm version major --no-git-tag-version | sed 's/v//')
            ;;
        4)
            VERSION_TYPE="prerelease"
            NEW_VERSION=$(npm version prerelease --preid=alpha --no-git-tag-version | sed 's/v//')
            ;;
        5)
            read -p "Enter custom version: " NEW_VERSION
            npm version $NEW_VERSION --no-git-tag-version >/dev/null
            VERSION_TYPE="custom"
            ;;
        6)
            NEW_VERSION=$CURRENT_VERSION
            VERSION_TYPE="none"
            ;;
        *)
            echo -e "${RED}❌ Invalid option${NC}"
            exit 1
            ;;
    esac
fi

echo -e "\n${GREEN}New version: ${NEW_VERSION}${NC}\n"

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm test || {
    echo -e "${RED}❌ Tests failed. Fix issues before publishing.${NC}"
    exit 1
}
echo -e "${GREEN}✓ Tests passed${NC}\n"

# Build the package
echo -e "${BLUE}🔨 Building package...${NC}"
npm run build || {
    echo -e "${RED}❌ Build failed.${NC}"
    exit 1
}
echo -e "${GREEN}✓ Build complete${NC}\n"

# Rebuild to include new version
echo -e "${BLUE}🔨 Rebuilding with updated version...${NC}"
npm run build || {
    echo -e "${RED}❌ Rebuild failed.${NC}"
    exit 1
}
echo -e "${GREEN}✓ Rebuild complete${NC}\n"

# Dry run first
echo -e "${BLUE}🔍 Running npm publish dry-run...${NC}"
npm publish --dry-run || {
    echo -e "${RED}❌ Dry run failed.${NC}"
    exit 1
}

echo -e "\n${YELLOW}📋 Summary:${NC}"
echo -e "  Package: postgresdk"
echo -e "  Version: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo -e "  Files to publish:"
echo -e "    - dist/ (compiled JavaScript)"
echo -e "    - README.md"
echo -e "    - LICENSE"
echo

if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Do you want to publish to npm? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Aborted. Version was updated but not published.${NC}"
        echo -e "To revert version: git checkout -- package.json src/cli.ts"
        exit 0
    fi
else
    echo -e "${GREEN}Publishing to npm (non-interactive mode)...${NC}"
fi

# Publish to npm
echo -e "\n${BLUE}🚀 Publishing to npm...${NC}"
npm publish || {
    echo -e "${RED}❌ Publish failed.${NC}"
    exit 1
}

echo -e "\n${GREEN}✨ Successfully published postgresdk@${NEW_VERSION} to npm!${NC}"

# Commit and tag if version was bumped
if [ "$VERSION_TYPE" != "none" ]; then
    echo
    if [ "$NON_INTERACTIVE" = true ]; then
        echo -e "${BLUE}Committing and tagging release (non-interactive mode)...${NC}"
        git add package.json
        git commit -m "Release v${NEW_VERSION}"
        git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
        echo -e "${GREEN}✓ Committed and tagged as v${NEW_VERSION}${NC}"
        echo -e "${YELLOW}Don't forget to push: git push && git push --tags${NC}"
    else
        read -p "Do you want to commit and tag this release? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add package.json
            git commit -m "Release v${NEW_VERSION}"
            git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
            echo -e "${GREEN}✓ Committed and tagged as v${NEW_VERSION}${NC}"
            echo -e "${YELLOW}Don't forget to push: git push && git push --tags${NC}"
        fi
    fi
fi

echo -e "\n${GREEN}🎉 Done!${NC}"
echo -e "View your package at: https://www.npmjs.com/package/postgresdk"