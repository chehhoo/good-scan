package com.cccmbiz.domain;

import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Getter
@Setter
@NoArgsConstructor
public class MealPlanView implements Serializable {
    private static final long serialVersionUID = -2883410526895516483L;

    private Integer householdId;
    private Integer breakfast1;
    private Integer breakfast2;
    private Integer breakfast3;
    private Integer dinner1;
    private Integer dinner2;
    private Integer dinner3;
    private Integer lunch1;
    private Integer lunch2;
    private Integer lunch3;
    private Double breakfastFee;
    private Double dinnerFee;
    private Double lunchFee;
}
