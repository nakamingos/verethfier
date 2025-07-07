#!/bin/bash

echo "🔍 Testing Signature Verification Fix"
echo "====================================="

echo "1. ✅ TypeScript compilation..."
cd /home/snep/devibe/verethfier-fresh/backend
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   TypeScript compiles cleanly"
else
    echo "   ❌ TypeScript compilation failed"
    exit 1
fi

echo "2. ✅ Running wallet service tests..."
npm test -- wallet.service.spec.ts --silent > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   Wallet service tests pass"
else
    echo "   ❌ Wallet service tests failed"
    exit 1
fi

echo "3. ✅ Running discord verification tests..."
npm test -- discord-verification.service.spec.ts --silent > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   Discord verification tests pass"
else
    echo "   ❌ Discord verification tests failed"
    exit 1
fi

echo "4. ✅ Running full test suite..."
npm test --silent > test_output.tmp 2>&1
if [ $? -eq 0 ]; then
    TOTAL_TESTS=$(grep -o '[0-9]\+ passed' test_output.tmp | tail -1 | grep -o '[0-9]\+')
    TOTAL_SUITES=$(grep -o '[0-9]\+ passed.*total' test_output.tmp | tail -1 | grep -o '[0-9]\+' | head -1)
    echo "   All $TOTAL_SUITES test suites pass ($TOTAL_TESTS total tests)"
else
    echo "   ❌ Some tests failed"
    cat test_output.tmp | grep -A 5 -B 5 "FAIL\|Summary of all failing tests"
    exit 1
fi

rm -f test_output.tmp

echo ""
echo "🎉 SIGNATURE VERIFICATION FIX VALIDATED!"
echo ""
echo "📝 Summary of changes:"
echo "   - ✅ Fixed frontend DecodedData interface to match backend"
echo "   - ✅ Removed legacy RoleID/RoleName fields from EIP-712 structure"
echo "   - ✅ Updated frontend EIP-712 message to match backend exactly"
echo "   - ✅ Fixed field name mapping (discordIconURL -> discordIcon)"
echo "   - ✅ Updated test expectations for Discord interaction behavior"
echo ""
echo "The signature verification should now work correctly!"
echo "Frontend and backend EIP-712 structures are now synchronized."
