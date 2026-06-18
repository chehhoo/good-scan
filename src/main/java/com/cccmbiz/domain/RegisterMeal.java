package com.cccmbiz.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@NoArgsConstructor
@Setter
@Getter
@EqualsAndHashCode
public class RegisterMeal {
    @Id
    @Column(name = "id")    private int id;
    @Column(name = "qty")   private byte qty;

    @ManyToOne
    @JoinColumn(name = "register_id", referencedColumnName = "id", nullable = false)
    private Register registerByRegisterId;

    @ManyToOne
    @JoinColumn(name = "meal_id", referencedColumnName = "id", nullable = false)
    private Meal mealByMealId;
}
