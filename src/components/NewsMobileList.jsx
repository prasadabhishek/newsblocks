import React from 'react';
import * as d3 from 'd3';

const NewsMobileList = ({ data, selectedStory, onStorySelect }) => {
    // Replicate exact color scale from Treemap for consistency
    const colorScale = d3.scaleLinear()
        .domain([-1, -0.6, -0.1, 0, 0.1, 0.6, 1])
        .range(['#ef4444', '#b91c1c', '#4d0a0a', '#1e293b', '#064e1c', '#15803d', '#22c55e']);

    if (!data || !data.children) return null;

    // Filter out empty categories
    const categories = data.children.filter(cat => cat.children && cat.children.length > 0);

    return (
        <div className="w-full h-full overflow-y-auto pb-32 custom-scrollbar">
            {categories.map((category) => (
                <div key={category.name} className="mb-6">
                    <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-md px-4 py-3 border-b border-slate-800">
                        <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase">
                            {category.name}
                        </h2>
                    </div>
                    <div className="flex flex-col gap-2 px-4 pt-4">
                        {category.children.map((story) => {
                            const isSelected = selectedStory?.slug === story.slug;
                            const sentimentColor = colorScale(story.sentiment);

                            return (
                                <div
                                    key={story.slug}
                                    onClick={() => onStorySelect(story)}
                                    className={`
                                        flex flex-col p-4 rounded-md cursor-pointer transition-all duration-200 shadow-sm
                                        ${isSelected ? 'bg-slate-800 ring-1 ring-slate-700' : 'bg-slate-900/60 hover:bg-slate-800/80'}
                                    `}
                                    style={{
                                        borderLeft: `5px solid ${sentimentColor}`
                                    }}
                                >
                                    <h3 className="text-[15px] font-semibold text-slate-200 leading-snug mb-3">
                                        {story.representativeTitle}
                                    </h3>
                                    <div className="flex items-center justify-between text-[11px] font-bold uppercase text-slate-500 tracking-widest">
                                        <span>{story.primarySource}</span>
                                        <span className={isSelected ? 'text-slate-400' : 'opacity-60'}>{story.citationCount} {story.citationCount === 1 ? 'SOURCE' : 'SOURCES'}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NewsMobileList;
