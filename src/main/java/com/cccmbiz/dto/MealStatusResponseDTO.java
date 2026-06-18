package com.cccmbiz.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class MealStatusResponseDTO {
    private Integer householdId;
    private List<MealStatusResponseMealPlansDTO> mealPlans;
}
