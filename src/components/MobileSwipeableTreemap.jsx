import React, { useState, useRef } from 'react';
import NewsTreemap from './NewsTreemap';

function MobileSwipeableTreemap({ data, selectedStory, onStorySelect, width, height }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const touchStartX = useRef(null);
    const touchEndX = useRef(null);

    if (!data || !data.children || data.children.length === 0) return null;

    const categories = data.children;
    const currentCategory = categories[activeIndex];

    // CULLING: Only take the top 5 largest clusters for mobile so it's not too dense
    let culledChildren = [];
    if (currentCategory && currentCategory.children) {
        culledChildren = [...currentCategory.children]
            .sort((a, b) => (b.weight || 0) - (a.weight || 0))
            .slice(0, 6); // Top 6 is a good sweet spot for massive blocks
    }

    // Isolate the tree to ONLY the culled category so it takes 100% of the screen
    const isolatedData = {
        name: data.name,
        children: [{
            ...currentCategory,
            children: culledChildren
        }]
    };

    // Swipe Threshold
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        touchEndX.current = null; // Reset
        touchStartX.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e) => {
        touchEndX.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStartX.current || !touchEndX.current) return;
        const distance = touchStartX.current - touchEndX.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && activeIndex < categories.length - 1) {
            setActiveIndex(activeIndex + 1);
        }
        if (isRightSwipe && activeIndex > 0) {
            setActiveIndex(activeIndex - 1);
        }
    };

    return (
        <div 
            className="flex flex-col h-full w-full bg-[#0f172a] overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Minimalist Swipeable Tab Header */}
            <div className="mobile-tabs-container">
                <div className="mobile-tabs-scroll">
                    {categories.map((cat, idx) => (
                        <span
                            key={cat.name}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveIndex(idx)}
                            className={`mobile-tab ${activeIndex === idx ? 'active' : ''}`}
                        >
                            {cat.name}
                        </span>
                    ))}
                </div>
            </div>

            {/* The Isolated D3 Treemap */}
            <div className="w-full relative" style={{ height: (height * 0.55) + 'px' }}>
                <NewsTreemap 
                    data={isolatedData} 
                    width={width}
                    height={height * 0.55}
                    selectedStory={selectedStory}
                    onStorySelect={onStorySelect}
                />
            </div>



            {/* Global styles to hide scrollbar for the tab header cleanly */}
            <style jsx="true">{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
}

export default MobileSwipeableTreemap;
