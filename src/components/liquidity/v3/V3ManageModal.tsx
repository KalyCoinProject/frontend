'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { V3Position } from '@/services/dex/IV3DexService';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits } from 'viem';
import { useTokenLists } from '@/hooks/useTokenLists';
import { CHAIN_IDS } from '@/config/chains';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface V3ManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: V3Position;
    onUpdate: () => void;
    initialTab?: 'remove' | 'collect';
}

export default function V3ManageModal({ isOpen, onClose, position, onUpdate, initialTab = 'remove' }: V3ManageModalProps) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [percentToRemove, setPercentToRemove] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<'idle' | 'decreasing' | 'collecting' | 'complete'>('idle');

    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { chainId } = useAccount();
    const { success, error: toastError } = useToast();
    const { tokens } = useTokenLists({ chainId: chainId || CHAIN_IDS.KALYCHAIN });

    // Resolve tokens
    const token0 = tokens.find(t => t.address.toLowerCase() === position.token0.toLowerCase());
    const token1 = tokens.find(t => t.address.toLowerCase() === position.token1.toLowerCase());
    const symbol0 = token0?.symbol || '???';
    const symbol1 = token1?.symbol || '???';

    const resetState = () => {
        setPercentToRemove(0);
        setStep('idle');
        setIsSubmitting(false);
    };

    useEffect(() => {
        if (isOpen) {
            resetState();
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    const handleRemoveLiquidity = async () => {
        if (!walletClient || !publicClient || !address) return;
        setIsSubmitting(true);
        setStep('decreasing');

        try {
            const v3Service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!v3Service) throw new Error('V3 not available on this chain');

            // Calculate liquidity to remove
            const liquidityAmount = BigInt(position.liquidity.toString());
            const amountToRemove = (liquidityAmount * BigInt(percentToRemove)) / 100n;

            if (amountToRemove > 0n) {
                // 1. Decrease Liquidity
                const hash = await v3Service.decreaseLiquidity({
                    tokenId: position.tokenId,
                    liquidity: amountToRemove,
                    amount0Min: '0', // Slippage hardcoded to 0 for demo/simplicity - TODO: Calculate
                    amount1Min: '0',
                    deadline: 20
                }, publicClient, walletClient);

                await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
            }

            // 2. Collect Fees (includes the burned principal which is now "owed")
            setStep('collecting');

            // We collect MaxUint128 to get everything owed
            const maxUint128 = 340282366920938463463374607431768211455n;

            const collectHash = await v3Service.collectFees({
                tokenId: position.tokenId,
                recipient: address,
                amount0Max: maxUint128,
                amount1Max: maxUint128
            }, publicClient, walletClient);

            await publicClient.waitForTransactionReceipt({ hash: collectHash as `0x${string}` });

            setStep('complete');
            onUpdate();

            success(
                "Success",
                "Liquidity removed and fees collected successfully."
            );

            // Close after delay
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error(error);
            toastError(
                "Error",
                error.message || "Failed to remove liquidity"
            );
            setStep('idle');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCollectFees = async () => {
        if (!walletClient || !publicClient || !address) return;
        setIsSubmitting(true);
        setStep('collecting');

        try {
            const v3Service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!v3Service) throw new Error('V3 not available on this chain');
            const maxUint128 = 340282366920938463463374607431768211455n;

            const hash = await v3Service.collectFees({
                tokenId: position.tokenId,
                recipient: address,
                amount0Max: maxUint128,
                amount1Max: maxUint128
            }, publicClient, walletClient);

            await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });

            setStep('complete');
            onUpdate();

            success(
                "Fees Collected",
                "Your uncollected fees and tokens have been sent to your wallet."
            );

            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error(error);
            toastError(
                "Error",
                "Failed to collect fees"
            );
            setStep('idle');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* FORCE solid background color and override any transparency */}
            <DialogContent className="sm:max-w-md !bg-transparent border-none shadow-none p-0 max-h-[85vh] overflow-y-auto">
                {/* Solid opaque background matching the visual 'Amber on Black' look (#181106) */}
                <div className="w-full p-6 text-white rounded-xl border border-amber-500/40 shadow-2xl" style={{ backgroundColor: '#181106' }}>
                    <DialogHeader>
                        <DialogTitle>Manage Position</DialogTitle>
                        <DialogDescription className="text-gray-300">
                            {symbol0}/{symbol1} • ID: {position.tokenId.toString()}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="remove" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-4">
                        <TabsList className="grid w-full grid-cols-2 bg-black/40">
                            <TabsTrigger value="remove" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Remove Liquidity</TabsTrigger>
                            <TabsTrigger value="collect" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Collect</TabsTrigger>
                        </TabsList>

                        <TabsContent value="remove" className="space-y-4 pt-4">
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span className="text-sm font-medium">Remove Amount</span>
                                    <span className="text-sm font-medium text-amber-400">{percentToRemove}%</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={percentToRemove}
                                    onChange={(val) => setPercentToRemove(val)}
                                    className="py-4"
                                />
                                <div className="flex gap-2 justify-between">
                                    {[25, 50, 75, 100].map((pct) => (
                                        <Button
                                            key={pct}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPercentToRemove(pct)}
                                            className="flex-1 text-xs bg-white/5 border-white/10 hover:bg-amber-500/20 hover:text-amber-300 transition-all"
                                        >
                                            {pct}%
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                className="w-full mt-4 bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/50 backdrop-blur-sm transition-all shadow-lg hover:shadow-red-500/20"
                                disabled={percentToRemove === 0 || isSubmitting}
                                onClick={handleRemoveLiquidity}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {step === 'decreasing' ? 'Removing...' : 'Collecting...'}
                                    </>
                                ) : (
                                    'Remove Liquidity'
                                )}
                            </Button>
                        </TabsContent>

                        <TabsContent value="collect" className="space-y-4 pt-4">
                            <div className="bg-black/20 border border-white/5 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">{symbol0} Owed</span>
                                    <span className="text-green-400 font-mono">
                                        {formatUnits(position.tokensOwed0, token0?.decimals || 18)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">{symbol1} Owed</span>
                                    <span className="text-green-400 font-mono">
                                        {formatUnits(position.tokensOwed1, token1?.decimals || 18)}
                                    </span>
                                </div>
                            </div>

                            <Button
                                className="w-full continue-button"
                                disabled={isSubmitting}
                                onClick={handleCollectFees}
                            >
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Collect Fees'}
                            </Button>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
